// local-api.js — Offline-Backend. Ersetzt das Express-Backend hinter identischer
// apiFetch(method, path, body)-Signatur. Hält den entschlüsselten VAULT in-memory,
// persistiert ihn als EINEN verschlüsselten Blob in localStorage. Kein Server, kein Konto.
//
// Aggregations- und CSV-Logik 1:1 aus server.js portiert.
// Exportiert window.LocalDB (Auth + Backup + CSV) und window.apiFetch (Daten-Router).
(function () {
  'use strict';
  const C = window.AusgabenCrypto;
  const LS_KEY = 'ai-ausgaben-vault';
  const MAGIC = 'AIAX1'; // Alien Investor Ausgaben, Format v1

  const DEFAULT_CATEGORIES = [
    'Wohnen', 'Abos', 'Lebensmittel', 'Versicherungen',
    'Transport', 'Freizeit', 'Gesundheit', 'Sonstiges'
  ];

  // In-memory Sitzungs-State (nie persistiert außer als verschlüsselter Blob)
  let KEY = null, SALT = null, VAULT = null;

  function emptyVault() {
    return {
      version: 1,
      expenses: [],
      fixedCosts: [],
      liabilities: [],   // Verbindlichkeiten (seit v1.6): offene Schulden/Zahlungen zum Abhaken
      categories: DEFAULT_CATEGORIES.map(name => ({ name }))
    };
  }

  function todayISO() { return new Date().toISOString().substring(0, 10); }
  function uuid() { return crypto.randomUUID(); }

  // ── Persistenz ────────────────────────────────────────────────────────────
  async function persist() {
    if (!KEY || !VAULT) throw new Error('Vault gesperrt');
    const blob = await C.encryptObj(VAULT, KEY);
    blob.magic = MAGIC; blob.kdf = 'PBKDF2-SHA256'; blob.iter = C.ITER; blob.salt = C.bufToB64(SALT);
    localStorage.setItem(LS_KEY, JSON.stringify(blob));
  }

  function hasVault() { return !!localStorage.getItem(LS_KEY); }
  function isUnlocked() { return !!(KEY && VAULT); }

  async function setup(password) {
    if (!password || password.length < 8) throw new Error('Passwort muss mindestens 8 Zeichen haben');
    SALT = crypto.getRandomValues(new Uint8Array(16));
    KEY = await C.deriveKey(password, SALT);
    VAULT = emptyVault();
    await persist();
  }

  // Import-Härtung: Vault-Inhalt nach dem Entschlüsseln schema-validieren. Jedes
  // wiederhergestellte Backup läuft hier durch (restoreVaultRaw -> lock -> unlock) —
  // eine präparierte .vault kann so kein HTML/JS in Felder wie amount/date/id schmuggeln.
  function sanitizeVault(v) {
    if (!v || typeof v !== 'object') v = {};
    // Strikt: nur echte Zahlen / sauber-numerische Strings. "999<svg…>" → 0 (nicht 999).
    const num = x => { const n = typeof x === 'number' ? x : Number(x); return isFinite(n) ? n : 0; };
    const str = (x, max) => typeof x === 'string' ? x.slice(0, max) : '';
    const dateOrNull = x => (typeof x === 'string' && /^\d{4}-\d{2}-\d{2}/.test(x)) ? x.slice(0, 10) : null;
    const idStr = x => (typeof x === 'string' && /^[0-9a-zA-Z-]{1,64}$/.test(x)) ? x : uuid();
    const out = emptyVault();
    out.expenses = (Array.isArray(v.expenses) ? v.expenses : []).filter(e => e && typeof e === 'object').map(e => ({
      id: idStr(e.id), name: str(e.name, 200), amount: num(e.amount),
      category: str(e.category, 60) || 'Sonstiges', date: dateOrNull(e.date) || todayISO(), note: str(e.note, 500)
    }));
    out.fixedCosts = (Array.isArray(v.fixedCosts) ? v.fixedCosts : []).filter(f => f && typeof f === 'object').map(f => ({
      id: idStr(f.id), name: str(f.name, 200), amount: num(f.amount),
      period: f.period === 'yearly' ? 'yearly' : 'monthly', category: str(f.category, 60) || 'Sonstiges',
      note: str(f.note, 500), usage: normalizeUsage(f.usage),
      active: f.active !== false, deactivatedAt: dateOrNull(f.deactivatedAt),
      since: dateOrNull(f.since)                       // fehlend/ungültig = null (aktiv für alle Monate, wie Altdaten)
    }));
    // Verbindlichkeiten: gleiche Whitelist-Strenge. done strikt boolean, Datumsfelder
    // (due/doneAt/createdAt) nur als YYYY-MM-DD oder null.
    out.liabilities = (Array.isArray(v.liabilities) ? v.liabilities : []).filter(l => l && typeof l === 'object').map(l => ({
      id: idStr(l.id), name: str(l.name, 200), amount: num(l.amount),
      due: dateOrNull(l.due), note: str(l.note, 500),
      done: l.done === true, doneAt: l.done === true ? dateOrNull(l.doneAt) : null,
      createdAt: dateOrNull(l.createdAt) || todayISO()
    }));
    const cats = (Array.isArray(v.categories) ? v.categories : [])
      .map(c => typeof c === 'string' ? c : (c && c.name))
      .filter(n => typeof n === 'string' && n.trim())
      .map(n => ({ name: n.trim().slice(0, 60) }));
    out.categories = cats.length ? cats : DEFAULT_CATEGORIES.map(name => ({ name }));
    return out;
  }

  async function unlock(password) {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) throw new Error('Kein Vault vorhanden');
    let blob;
    try { blob = JSON.parse(raw); } catch (e) { throw new Error('Vault beschädigt'); }
    const salt = new Uint8Array(C.b64ToBuf(blob.salt));
    const k = await C.deriveKey(password, salt);
    let v;
    try {
      v = await C.decryptBlob(blob, k);
    } catch (e) {
      throw new Error('Falsches Passwort'); // GCM-Auth schlägt bei falschem Schlüssel fehl
    }
    KEY = k; SALT = salt;
    VAULT = sanitizeVault(v);
  }

  function lock() { KEY = null; VAULT = null; SALT = null; }

  async function changePassword(oldPw, newPw) {
    if (!isUnlocked()) throw new Error('Vault gesperrt');
    // Altes Passwort gegen den gespeicherten Blob verifizieren
    const raw = localStorage.getItem(LS_KEY);
    const blob = JSON.parse(raw);
    const salt = new Uint8Array(C.b64ToBuf(blob.salt));
    const k = await C.deriveKey(oldPw, salt);
    try { await C.decryptBlob(blob, k); } catch (e) { throw new Error('Aktuelles Passwort falsch'); }
    if (!newPw || newPw.length < 8) throw new Error('Neues Passwort muss mindestens 8 Zeichen haben');
    SALT = crypto.getRandomValues(new Uint8Array(16));
    KEY = await C.deriveKey(newPw, SALT);
    await persist();
  }

  // ── Backup / Restore (.vault-Datei = der verschlüsselte Blob selbst) ────────
  function exportVaultRaw() { return localStorage.getItem(LS_KEY) || ''; }

  // Überschreibt den gespeicherten Blob mit einem Backup. Danach muss mit dem
  // Passwort dieses Backups entsperrt werden (Aufrufer ruft lock() + Lock-Screen).
  function restoreVaultRaw(content) {
    let blob;
    try { blob = JSON.parse(content); } catch (e) { throw new Error('Keine gültige Backup-Datei'); }
    if (!blob || !blob.iv || !blob.ct || !blob.salt) throw new Error('Keine gültige Ausgaben-Backup-Datei');
    localStorage.setItem(LS_KEY, content);
    lock();
  }

  // ── Migration aus dem alten Server-Format (einmalig, additiv über id) ───────
  async function migrateFromLegacy(bundle) {
    if (!isUnlocked()) throw new Error('Vault gesperrt');
    const byId = arr => new Map((arr || []).map(e => [e.id, e]));
    let addedE = 0, addedF = 0;
    const eMap = byId(VAULT.expenses);
    for (const e of (bundle.expenses || [])) { if (e && e.id && !eMap.has(e.id)) { eMap.set(e.id, e); addedE++; } }
    VAULT.expenses = Array.from(eMap.values());
    const fMap = byId(VAULT.fixedCosts);
    for (const f of (bundle.fixedCosts || [])) { if (f && f.id && !fMap.has(f.id)) { fMap.set(f.id, f); addedF++; } }
    VAULT.fixedCosts = Array.from(fMap.values());
    if (Array.isArray(bundle.categories) && bundle.categories.length) {
      const have = new Set(VAULT.categories.map(c => c.name.toLowerCase()));
      bundle.categories.forEach(c => {
        const name = typeof c === 'string' ? c : c.name;
        if (name && !have.has(name.toLowerCase())) { VAULT.categories.push({ name }); have.add(name.toLowerCase()); }
      });
    }
    VAULT = sanitizeVault(VAULT);   // auch Legacy-Daten durch die Schema-Prüfung
    await persist();
    return { expenses: addedE, fixedCosts: addedF };
  }

  // ── Portierte Server-Logik ──────────────────────────────────────────────────
  function monthlyAmount(fc) { return fc.period === 'yearly' ? fc.amount / 12 : fc.amount; }
  function normalizeUsage(u) { return (u === 'betrieblich' || u === 'anteilig') ? u : 'privat'; }
  function isFixedActiveForMonth(fc, yearMonth) {
    if (fc.since && fc.since.substring(0, 7) > yearMonth) return false;
    if (!fc.active && fc.deactivatedAt && fc.deactivatedAt.substring(0, 7) <= yearMonth) return false;
    return true;
  }
  function fixedTotalForMonth(fixedCosts, yearMonth) {
    return fixedCosts.filter(fc => isFixedActiveForMonth(fc, yearMonth))
      .reduce((sum, fc) => sum + monthlyAmount(fc), 0);
  }
  function variableTotalForMonth(expenses, year, month) {
    return expenses.filter(e => {
      const d = new Date(e.date);
      return d.getFullYear() === year && (d.getMonth() + 1) === month;
    }).reduce((sum, e) => sum + e.amount, 0);
  }

  function dashboard(qYear, qMonth) {
    const fixedCosts = VAULT.fixedCosts, expenses = VAULT.expenses;
    const now = new Date();
    const year = qYear || now.getFullYear();
    const month = qMonth || (now.getMonth() + 1);
    const yearMonth = `${year}-${String(month).padStart(2, '0')}`;

    const prevDate = new Date(year, month - 2, 1);
    const prevYear = prevDate.getFullYear();
    const prevMonth = prevDate.getMonth() + 1;
    const prevYearMonth = `${prevYear}-${String(prevMonth).padStart(2, '0')}`;

    const fixedTotal = fixedTotalForMonth(fixedCosts, yearMonth);
    const variableTotal = variableTotalForMonth(expenses, year, month);
    const total = fixedTotal + variableTotal;
    const prevTotal = fixedTotalForMonth(fixedCosts, prevYearMonth) + variableTotalForMonth(expenses, prevYear, prevMonth);

    const currentExpenses = expenses
      .filter(e => { const d = new Date(e.date); return d.getFullYear() === year && (d.getMonth() + 1) === month; })
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    const activeFixed = fixedCosts.filter(fc => isFixedActiveForMonth(fc, yearMonth)).sort((a, b) => b.amount - a.amount);

    return {
      year, month, yearMonth,
      fixed_total: fixedTotal, variable_total: variableTotal, total,
      prev_total: prevTotal,
      delta_pct: prevTotal > 0 ? ((total - prevTotal) / prevTotal * 100) : null,
      active_fixed_costs: activeFixed, current_expenses: currentExpenses
    };
  }

  function annual(qYear) {
    const fixedCosts = VAULT.fixedCosts, expenses = VAULT.expenses;
    const year = qYear || new Date().getFullYear();
    const months = Array.from({ length: 12 }, (_, i) => {
      const m = i + 1;
      const yearMonth = `${year}-${String(m).padStart(2, '0')}`;
      const fixedTotal = fixedTotalForMonth(fixedCosts, yearMonth);
      const variableTotal = variableTotalForMonth(expenses, year, m);
      return { month: m, yearMonth, fixed_total: fixedTotal, variable_total: variableTotal, total: fixedTotal + variableTotal };
    });
    const yearFixed = months.reduce((s, m) => s + m.fixed_total, 0);
    const yearVariable = months.reduce((s, m) => s + m.variable_total, 0);
    return { year, months, year_fixed: yearFixed, year_variable: yearVariable, year_total: yearFixed + yearVariable };
  }

  function csvRows(rows) {
    // Formel-Injection neutralisieren (=,+,@ am Zellanfang würde in Excel/Calc als Formel laufen)
    const cell = v => { let s = String(v); if (/^[=+@]/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; };
    return rows.map(r => r.map(cell).join(',')).join('\r\n');
  }

  // CSV-Export (variable Ausgaben + amortisierte Fixkosten). Liefert {filename, content}.
  function csvExport(year, month) {
    year = year ? parseInt(year) : null;
    month = month ? parseInt(month) : null;
    const fixedCosts = VAULT.fixedCosts, expenses = VAULT.expenses;
    const rows = [['Datum', 'Name', 'Kategorie', 'Betrag (EUR)', 'Typ', 'Notiz']];

    let filtered = expenses.slice();
    if (year) filtered = filtered.filter(e => new Date(e.date).getFullYear() === year);
    if (month) filtered = filtered.filter(e => (new Date(e.date).getMonth() + 1) === month);
    filtered.sort((a, b) => new Date(a.date) - new Date(b.date));
    filtered.forEach(e => rows.push([e.date, e.name, e.category, e.amount.toFixed(2), 'Variabel', e.note || '']));

    if (year) {
      const targetMonths = month ? [month] : Array.from({ length: 12 }, (_, i) => i + 1);
      targetMonths.forEach(m => {
        const yearMonth = `${year}-${String(m).padStart(2, '0')}`;
        const date = `${yearMonth}-01`;
        fixedCosts.filter(fc => isFixedActiveForMonth(fc, yearMonth)).forEach(fc => {
          const monthly = monthlyAmount(fc);
          const typ = fc.period === 'yearly' ? 'Fixkosten (jährl./12)' : 'Fixkosten (monatl.)';
          rows.push([date, fc.name, fc.category, monthly.toFixed(2), typ, fc.note || '']);
        });
      });
    }
    const fn = `ausgaben_${year || 'alle'}${month ? '_' + String(month).padStart(2, '0') : ''}.csv`;
    return { filename: fn, content: '﻿' + csvRows(rows) };
  }

  // Fixkosten-Zusammenfassung (je Position eine Zeile). Liefert {filename, content}.
  function csvFixedSummary(year, month) {
    const now = new Date();
    year = year ? parseInt(year) : now.getFullYear();
    month = month ? parseInt(month) : (now.getMonth() + 1);
    const yearMonth = `${year}-${String(month).padStart(2, '0')}`;

    const active = VAULT.fixedCosts
      .filter(fc => isFixedActiveForMonth(fc, yearMonth))
      .map(fc => {
        const monthly = monthlyAmount(fc);
        return {
          name: fc.name, category: fc.category,
          typ: fc.period === 'yearly' ? 'jährl./12' : 'monatlich',
          usage: normalizeUsage(fc.usage), monthly, yearly: monthly * 12, note: fc.note || ''
        };
      })
      .sort((a, b) => b.monthly - a.monthly);

    const sumMonthly = active.reduce((s, r) => s + r.monthly, 0);
    const sumYearly = active.reduce((s, r) => s + r.yearly, 0);
    const sumBy = u => ({
      m: active.filter(r => r.usage === u).reduce((s, r) => s + r.monthly, 0),
      y: active.filter(r => r.usage === u).reduce((s, r) => s + r.yearly, 0)
    });
    const biz = sumBy('betrieblich'), part = sumBy('anteilig');

    const rows = [['Name', 'Kategorie', 'Typ', 'Nutzung', 'Betrag/Monat (EUR)', 'Betrag/Jahr (EUR)', 'Notiz']];
    active.forEach(r => rows.push([r.name, r.category, r.typ, r.usage, r.monthly.toFixed(2), r.yearly.toFixed(2), r.note]));
    rows.push(['GESAMT', '', '', '', sumMonthly.toFixed(2), sumYearly.toFixed(2), '']);
    rows.push(['davon betrieblich', '', '', 'betrieblich', biz.m.toFixed(2), biz.y.toFixed(2), '']);
    rows.push(['davon anteilig (Anteil mit Steuerberater klären)', '', '', 'anteilig', part.m.toFixed(2), part.y.toFixed(2), '']);
    return { filename: `fixkosten_zusammenfassung_${yearMonth}.csv`, content: '﻿' + csvRows(rows) };
  }

  // ── apiFetch-Router (gleiche Signatur wie der alte fetch-Wrapper) ───────────
  function parse(path) {
    const [p, qs] = path.split('?');
    const query = {};
    if (qs) qs.split('&').forEach(kv => { const [k, v] = kv.split('='); query[k] = decodeURIComponent(v || ''); });
    return { segs: p.replace(/^\//, '').split('/'), query };
  }
  const err = (msg) => { throw new Error(msg); };

  async function apiFetch(method, path, body) {
    if (!isUnlocked()) throw new Error('Vault gesperrt');
    const { segs, query } = parse(path); // segs: ['api', ...]
    const res = segs[1];                  // 'expenses' | 'fixed-costs' | 'dashboard' | ...
    const id = segs[2];

    // --- categories ---
    if (res === 'categories') {
      if (method === 'GET') return VAULT.categories;
      if (method === 'POST') {
        const name = body && body.name;
        if (!name) err('name ist Pflichtfeld');
        if (VAULT.categories.find(c => c.name.toLowerCase() === name.toLowerCase())) err('Kategorie existiert bereits');
        const entry = { name: String(name).trim() };
        VAULT.categories.push(entry); await persist(); return entry;
      }
    }

    // --- dashboard / annual ---
    if (res === 'dashboard' && method === 'GET') {
      return dashboard(query.year ? parseInt(query.year) : null, query.month ? parseInt(query.month) : null);
    }
    if (res === 'annual' && method === 'GET') {
      return annual(query.year ? parseInt(query.year) : null);
    }

    // --- fixed-costs ---
    if (res === 'fixed-costs') {
      if (method === 'GET' && !id) return VAULT.fixedCosts;
      if (method === 'POST') {
        const { name, amount, period, category, note, since, usage } = body || {};
        if (!name || amount === undefined) err('name und amount sind Pflichtfelder');
        const entry = {
          id: uuid(), name: String(name).trim(), amount: parseFloat(amount),
          period: period === 'yearly' ? 'yearly' : 'monthly', category: category || 'Sonstiges',
          note: note || '', usage: normalizeUsage(usage), active: true, deactivatedAt: null,
          since: since || todayISO()
        };
        VAULT.fixedCosts.push(entry); await persist(); return entry;
      }
      const idx = VAULT.fixedCosts.findIndex(fc => fc.id === id);
      if (method === 'PATCH') {
        if (idx === -1) err('Nicht gefunden');
        const fc = VAULT.fixedCosts[idx];
        const { name, amount, period, category, note, since, usage, active } = body || {};
        if (name !== undefined) fc.name = String(name).trim();
        if (amount !== undefined) fc.amount = parseFloat(amount);
        if (period !== undefined) fc.period = period;
        if (category !== undefined) fc.category = category;
        if (note !== undefined) fc.note = note;
        if (since !== undefined) fc.since = since;
        if (usage !== undefined) fc.usage = normalizeUsage(usage);
        if (active !== undefined) {
          const isActive = Boolean(active);
          fc.active = isActive;
          if (!isActive && !fc.deactivatedAt) fc.deactivatedAt = todayISO();
          else if (isActive) fc.deactivatedAt = null;
        }
        await persist(); return fc;
      }
      if (method === 'DELETE') {
        if (idx === -1) err('Nicht gefunden');
        VAULT.fixedCosts.splice(idx, 1); await persist(); return null;
      }
    }

    // --- liabilities (Verbindlichkeiten) ---
    // Sortierung: offene zuerst (Fälligkeit aufsteigend, ohne Datum ans Ende), dann erledigte
    // (zuletzt erledigte oben). Betrag strikt Number() — kein parseFloat.
    if (res === 'liabilities') {
      const amt = x => { const n = Number(x); return isFinite(n) && n >= 0 ? n : null; };
      const dateOrNull = x => (typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x)) ? x : null;
      if (method === 'GET' && !id) {
        return VAULT.liabilities.slice().sort((a, b) => {
          if (a.done !== b.done) return a.done ? 1 : -1;
          if (!a.done) return (a.due || '9999').localeCompare(b.due || '9999') || (a.createdAt || '').localeCompare(b.createdAt || '');
          return (b.doneAt || '').localeCompare(a.doneAt || '');
        });
      }
      if (method === 'POST') {
        const { name, amount, due, note } = body || {};
        const a = amt(amount);
        if (!name || a === null) err('name und amount sind Pflichtfelder');
        const entry = {
          id: uuid(), name: String(name).trim().slice(0, 200), amount: a,
          due: dateOrNull(due), note: String(note || '').slice(0, 500),
          done: false, doneAt: null, createdAt: todayISO()
        };
        VAULT.liabilities.push(entry); await persist(); return entry;
      }
      const idx = VAULT.liabilities.findIndex(l => l.id === id);
      if (method === 'PATCH') {
        if (idx === -1) err('Nicht gefunden');
        const l = VAULT.liabilities[idx];
        const { name, amount, due, note, done } = body || {};
        if (name !== undefined) l.name = String(name).trim().slice(0, 200);
        if (amount !== undefined) { const a = amt(amount); if (a === null) err('Ungültiger Betrag'); l.amount = a; }
        if (due !== undefined) l.due = dateOrNull(due);
        if (note !== undefined) l.note = String(note || '').slice(0, 500);
        if (done !== undefined) {
          l.done = done === true;
          l.doneAt = l.done ? todayISO() : null;
        }
        await persist(); return l;
      }
      if (method === 'DELETE') {
        if (idx === -1) err('Nicht gefunden');
        VAULT.liabilities.splice(idx, 1); await persist(); return null;
      }
    }

    // --- expenses ---
    if (res === 'expenses') {
      if (method === 'GET' && !id) {
        let list = VAULT.expenses.slice();
        if (query.year) list = list.filter(e => new Date(e.date).getFullYear() === parseInt(query.year));
        if (query.month) list = list.filter(e => (new Date(e.date).getMonth() + 1) === parseInt(query.month));
        list.sort((a, b) => new Date(b.date) - new Date(a.date));
        return list;
      }
      if (method === 'POST') {
        const { name, amount, category, date, note } = body || {};
        if (!name || amount === undefined) err('name und amount sind Pflichtfelder');
        const entry = {
          id: uuid(), name: String(name).trim(), amount: parseFloat(amount),
          category: category || 'Sonstiges', date: date || todayISO(), note: note || ''
        };
        VAULT.expenses.push(entry); await persist(); return entry;
      }
      const idx = VAULT.expenses.findIndex(e => e.id === id);
      if (method === 'PATCH') {
        if (idx === -1) err('Nicht gefunden');
        const e = VAULT.expenses[idx];
        const { name, amount, category, date, note } = body || {};
        if (name !== undefined) e.name = String(name).trim();
        if (amount !== undefined) e.amount = parseFloat(amount);
        if (category !== undefined) e.category = category;
        if (date !== undefined) e.date = date;
        if (note !== undefined) e.note = note;
        await persist(); return e;
      }
      if (method === 'DELETE') {
        if (idx === -1) err('Nicht gefunden');
        VAULT.expenses.splice(idx, 1); await persist(); return null;
      }
    }

    throw new Error(`Unbekannte Route: ${method} ${path}`);
  }

  window.LocalDB = {
    hasVault, isUnlocked, setup, unlock, lock, changePassword,
    exportVaultRaw, restoreVaultRaw, migrateFromLegacy,
    csvExport, csvFixedSummary
  };
  window.apiFetch = apiFetch;
})();
