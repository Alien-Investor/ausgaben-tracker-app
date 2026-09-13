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

  // Standard-Kategorien in der Sprache, die beim Einrichten aktiv ist (Bestandsdaten bleiben unverändert).
  // Die Auffang-Kategorie (letzter Eintrag) nimmt Einträge gelöschter Kategorien auf.
  const DEFAULT_CATEGORIES = {
    de: ['Wohnen', 'Abos', 'Lebensmittel', 'Versicherungen', 'Transport', 'Freizeit', 'Gesundheit', 'Sonstiges'],
    en: ['Housing', 'Subscriptions', 'Groceries', 'Insurance', 'Transport', 'Leisure', 'Health', 'Other']
  };
  const FALLBACK_CATEGORY = { de: 'Sonstiges', en: 'Other' };
  function currentLang() { return (window.I18N && window.I18N.lang === 'en') ? 'en' : 'de'; }
  function fallbackCategory() {
    // Bevorzugt eine vorhandene Auffang-Kategorie des Vaults (DE oder EN), sonst die der aktiven Sprache
    const have = (VAULT && VAULT.categories || []).map(c => c.name);
    return have.find(n => n === FALLBACK_CATEGORY.de || n === FALLBACK_CATEGORY.en) || FALLBACK_CATEGORY[currentLang()];
  }
  // Wohin Einträge wandern, wenn Kategorie `excludeId` gelöscht wird: Auffang-Kategorie, sonst die erste verbleibende
  function deleteTarget(excludeId) {
    const rest = VAULT.categories.filter(c => c.id !== excludeId);
    const fb = rest.find(c => c.name === FALLBACK_CATEGORY.de || c.name === FALLBACK_CATEGORY.en);
    return fb ? fb.name : (rest[0] ? rest[0].name : FALLBACK_CATEGORY[currentLang()]);
  }

  // Einstellungen im Tresor (wandern mit dem Backup). autolock in Minuten, 0 = aus.
  const AUTOLOCK_CHOICES = [0, 1, 5, 15, 30];
  const SETTINGS_DEFAULT = { autolock: 5 };

  // In-memory Sitzungs-State (nie persistiert außer als verschlüsselter Blob)
  let KEY = null, SALT = null, VAULT = null;

  function emptyVault(lang) {
    return {
      version: 1,
      expenses: [],
      fixedCosts: [],
      liabilities: [],   // Verbindlichkeiten (seit v1.6): offene Schulden/Zahlungen zum Abhaken
      categories: DEFAULT_CATEGORIES[lang || currentLang()].map(name => ({ id: uuid(), name })),
      settings: Object.assign({}, SETTINGS_DEFAULT)
    };
  }

  // Heutiges Datum in LOKALER Zeit (toISOString wäre UTC: in Berlin zwischen 0 und 2 Uhr „gestern",
  // in Amerika abends schon „morgen" — Audit run-1 #3).
  function todayISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function uuid() { return crypto.randomUUID(); }

  // ── Validierungs-Primitive (gemeinsam für sanitizeVault UND die Routen — Audit run-1:
  //    was eine Route annimmt, muss den nächsten Entsperr-Lauf unverändert überleben) ──
  // Strikt: nur echte Zahlen / sauber-numerische Strings. "999<svg…>" → 0 (nicht 999). Kein parseFloat.
  const num = x => { const n = typeof x === 'number' ? x : (typeof x === 'string' && x.trim() !== '' ? Number(x) : NaN); return isFinite(n) ? n : 0; };
  const str = (x, max) => typeof x === 'string' ? x.slice(0, max) : '';
  // Nur echte Kalenderdaten YYYY-MM-DD (Audit run-1 #11: „2026-13-45" passierte die alte Regex und wurde
  // zum unsichtbaren Geist, „2026-02-30" rutschte in den März).
  const dateOrNull = x => {
    if (typeof x !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(x)) return null;
    const s = x.slice(0, 10);
    const d = new Date(s + 'T00:00:00Z');
    return (!isNaN(d) && d.toISOString().slice(0, 10) === s) ? s : null;
  };
  const idStr = x => (typeof x === 'string' && /^[0-9a-zA-Z-]{1,64}$/.test(x)) ? x : uuid();
  const AMOUNT_MAX = 1e12;
  // Betrag aus einer Route: endlich, nicht negativ, gedeckelt — sonst err.badAmount
  const routeAmount = x => {
    const n = typeof x === 'number' ? x : (typeof x === 'string' && x.trim() !== '' ? Number(x) : NaN);
    if (!isFinite(n) || n < 0 || n > AMOUNT_MAX) err('err.badAmount');
    return n;
  };

  // ── Persistenz ────────────────────────────────────────────────────────────
  // Fehlermeldungen sind i18n-Schlüssel (err.*) — app.js übersetzt sie über tErr().
  // Schlüsselgeneration VOR dem await pinnen und danach prüfen: ein lock()/Restore während des
  // Verschlüsselns darf nie einen Blob mit leerem Salt schreiben (Audit run-1 #12, latent).
  async function persist() {
    const key = KEY, vault = VAULT, salt = SALT;
    if (!key || !vault || !salt) throw new Error('err.locked');
    const blob = await C.encryptObj(vault, key);
    if (KEY !== key || SALT !== salt || VAULT !== vault) throw new Error('err.locked');
    blob.magic = MAGIC; blob.kdf = 'PBKDF2-SHA256'; blob.iter = C.ITER; blob.salt = C.bufToB64(salt);
    localStorage.setItem(LS_KEY, JSON.stringify(blob));
  }

  function hasVault() { return !!localStorage.getItem(LS_KEY); }
  function isUnlocked() { return !!(KEY && VAULT); }

  async function setup(password) {
    if (!password || password.length < 8) throw new Error('err.shortPass');
    SALT = crypto.getRandomValues(new Uint8Array(16));
    KEY = await C.deriveKey(password, SALT);
    VAULT = emptyVault(currentLang());
    await persist();
  }

  // Import-Härtung: Vault-Inhalt nach dem Entschlüsseln schema-validieren. Jedes
  // wiederhergestellte Backup läuft hier durch (restoreVaultRaw -> lock -> unlock) —
  // eine präparierte .vault kann so kein HTML/JS in Felder wie amount/date/id schmuggeln.
  function sanitizeVault(v) {
    if (!v || typeof v !== 'object') v = {};
    const out = emptyVault();
    const fb = FALLBACK_CATEGORY[currentLang()];
    // Doppelte IDs in einem Backup ließen die UI den falschen Datensatz bearbeiten/löschen
    // (Audit run-1 #5): jede Kollision bekommt eine frische UUID.
    const seenIds = new Set();
    const uniqueId = x => { let id = idStr(x); if (seenIds.has(id)) id = uuid(); seenIds.add(id); return id; };
    const amt = x => Math.min(Math.max(num(x), 0), AMOUNT_MAX);
    out.expenses = (Array.isArray(v.expenses) ? v.expenses : []).filter(e => e && typeof e === 'object').map(e => ({
      id: uniqueId(e.id), name: str(e.name, 200), amount: amt(e.amount),
      category: str(e.category, 60).trim() || fb, date: dateOrNull(e.date) || todayISO(), note: str(e.note, 500)
    }));
    out.fixedCosts = (Array.isArray(v.fixedCosts) ? v.fixedCosts : []).filter(f => f && typeof f === 'object').map(f => {
      const active = f.active !== false;
      return {
        id: uniqueId(f.id), name: str(f.name, 200), amount: amt(f.amount),
        period: f.period === 'yearly' ? 'yearly' : 'monthly', category: str(f.category, 60).trim() || fb,
        note: str(f.note, 500), usage: normalizeUsage(f.usage),
        active,
        // Inaktiv ohne gültiges Datum = null = inaktiv für ALLE Monate (Audit run-1 #6, Nachbesserung v1.7.1:
        // „heute" als Ersatzdatum ließ den Posten in allen Vormonaten weiterzählen)
        deactivatedAt: active ? null : dateOrNull(f.deactivatedAt),
        since: dateOrNull(f.since)                       // fehlend/ungültig = null (aktiv für alle Monate, wie Altdaten)
      };
    });
    // Verbindlichkeiten: gleiche Whitelist-Strenge. done strikt boolean, Datumsfelder
    // (due/doneAt/createdAt) nur als YYYY-MM-DD oder null.
    out.liabilities = (Array.isArray(v.liabilities) ? v.liabilities : []).filter(l => l && typeof l === 'object').map(l => ({
      id: uniqueId(l.id), name: str(l.name, 200), amount: amt(l.amount),
      due: dateOrNull(l.due), note: str(l.note, 500),
      done: l.done === true, doneAt: l.done === true ? dateOrNull(l.doneAt) : null,
      createdAt: dateOrNull(l.createdAt) || todayISO()
    }));
    // Kategorien: Name gekappt, id auf UUID-Zeichen (Altdaten ohne id bekommen eine), Dubletten (case-insensitiv) raus
    const seen = new Set();
    const cats = (Array.isArray(v.categories) ? v.categories : [])
      .map(c => typeof c === 'string' ? { name: c } : c)
      .filter(c => c && typeof c === 'object' && typeof c.name === 'string' && c.name.trim())
      .map(c => ({ id: uniqueId(c.id), name: c.name.trim().slice(0, 60) }))
      .filter(c => { const k = c.name.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
    out.categories = cats.length ? cats : out.categories;
    // Einstellungen: nur bekannte Felder, nur erlaubte Werte. Strikt Zahl — Number(null) wäre 0 = „Aus"
    // (Audit run-1 #7).
    const s = (v.settings && typeof v.settings === 'object') ? v.settings : {};
    out.settings = { autolock: (typeof s.autolock === 'number' && AUTOLOCK_CHOICES.includes(s.autolock)) ? s.autolock : SETTINGS_DEFAULT.autolock };
    return out;
  }

  // Blob-Struktur prüfen, ohne ihn zu übernehmen (Backup-Datei oder localStorage-Inhalt)
  function parseBlob(raw) {
    let blob;
    try { blob = JSON.parse(raw); } catch (e) { throw new Error('err.badBackup'); }
    if (!blob || typeof blob !== 'object' || blob.magic !== MAGIC) throw new Error('err.badBackup');
    if (['iv', 'ct', 'salt'].some(k => typeof blob[k] !== 'string' || !blob[k])) throw new Error('err.badBackup');
    let salt;
    try { salt = new Uint8Array(C.b64ToBuf(blob.salt)); C.b64ToBuf(blob.iv); } catch (e) { throw new Error('err.corrupt'); }
    if (salt.length < 8) throw new Error('err.corrupt');
    return { blob, salt };
  }

  // Blob mit Passwort öffnen: liefert {key, salt, vault} oder wirft err.wrongPass / err.corrupt / err.badBackup
  async function openBlob(raw, password) {
    const { blob, salt } = parseBlob(raw);
    const key = await C.deriveKey(password, salt);
    let v;
    try {
      v = await C.decryptBlob(blob, key);
    } catch (e) {
      throw new Error('err.wrongPass'); // GCM-Auth schlägt bei falschem Schlüssel fehl
    }
    return { key, salt, vault: sanitizeVault(v) };
  }

  async function unlock(password) {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) throw new Error('err.noVault');
    const o = await openBlob(raw, password);
    KEY = o.key; SALT = o.salt; VAULT = o.vault;
  }

  function lock() { KEY = null; VAULT = null; SALT = null; }

  async function changePassword(oldPw, newPw) {
    if (!isUnlocked()) throw new Error('err.locked');
    // Altes Passwort gegen den gespeicherten Blob verifizieren
    const raw = localStorage.getItem(LS_KEY);
    const { blob, salt } = parseBlob(raw);
    const k = await C.deriveKey(oldPw, salt);
    try { await C.decryptBlob(blob, k); } catch (e) { throw new Error('err.wrongCurrentPass'); }
    if (!newPw || newPw.length < 8) throw new Error('err.shortPass');
    SALT = crypto.getRandomValues(new Uint8Array(16));
    KEY = await C.deriveKey(newPw, SALT);
    await persist();
  }

  // ── Backup / Restore (.vault-Datei = der verschlüsselte Blob selbst) ────────
  function exportVaultRaw() { return localStorage.getItem(LS_KEY) || ''; }

  // Strukturprüfung einer Backup-Datei (vor der Passwortabfrage): wirft err.badBackup / err.corrupt
  function checkBackup(content) { parseBlob(String(content)); return true; }

  // Backup übernehmen — ERST mit dem Backup-Passwort entschlüsseln und prüfen, DANN den gespeicherten
  // Blob ersetzen (Audit run-1 #1: vorher wurde die einzige Kopie überschrieben, bevor feststand, ob die
  // Datei überhaupt zu öffnen ist). Danach ist der Tresor mit dem Backup-Inhalt entsperrt.
  async function restoreVault(content, password) {
    const raw = String(content);
    const o = await openBlob(raw, password);
    localStorage.setItem(LS_KEY, raw);
    KEY = o.key; SALT = o.salt; VAULT = o.vault;
  }

  // ── Portierte Server-Logik ──────────────────────────────────────────────────
  // Datumsvergleiche ausschließlich als Strings (YYYY-MM-DD sortiert lexikografisch). new Date('YYYY-MM-DD')
  // ist UTC-Mitternacht — in UTC-negativen Zeitzonen rutschte der 1. eines Monats in den Vormonat (Audit run-1 #3).
  const ym = (year, month) => `${year}-${String(month).padStart(2, '0')}`;
  const inMonth = (e, year, month) => typeof e.date === 'string' && e.date.slice(0, 7) === ym(year, month);
  const inYear = (e, year) => typeof e.date === 'string' && e.date.slice(0, 4) === String(year);
  const byDateDesc = (a, b) => (b.date || '').localeCompare(a.date || '');
  function monthlyAmount(fc) { return fc.period === 'yearly' ? fc.amount / 12 : fc.amount; }
  function normalizeUsage(u) { return (u === 'betrieblich' || u === 'anteilig') ? u : 'privat'; }
  function isFixedActiveForMonth(fc, yearMonth) {
    if (fc.since && fc.since.substring(0, 7) > yearMonth) return false;
    // inaktiv ohne Datum (null) = inaktiv für alle Monate; nur ein echtes Datum begrenzt die Deaktivierung nach hinten
    if (!fc.active && (!fc.deactivatedAt || fc.deactivatedAt.substring(0, 7) <= yearMonth)) return false;
    return true;
  }
  function fixedTotalForMonth(fixedCosts, yearMonth) {
    return fixedCosts.filter(fc => isFixedActiveForMonth(fc, yearMonth))
      .reduce((sum, fc) => sum + monthlyAmount(fc), 0);
  }
  function variableTotalForMonth(expenses, year, month) {
    return expenses.filter(e => inMonth(e, year, month)).reduce((sum, e) => sum + e.amount, 0);
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

    const currentExpenses = expenses.filter(e => inMonth(e, year, month)).sort(byDateDesc);
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
    // Formel-Injection neutralisieren (=,+,-,@ sowie Whitespace/Tab/CR am Zellanfang würden in Excel/Calc
    // als Formel laufen — auch " =1+1" nach dem Trimmen mancher Importe)
    const cell = v => { let s = String(v); if (/^[\s=+\-@]/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; };
    return rows.map(r => r.map(cell).join(',')).join('\r\n');
  }

  // CSV-Export (variable Ausgaben + amortisierte Fixkosten). Liefert {filename, content}.
  function csvExport(year, month) {
    year = year ? parseInt(year) : null;
    month = month ? parseInt(month) : null;
    const fixedCosts = VAULT.fixedCosts, expenses = VAULT.expenses;
    const rows = [['Datum', 'Name', 'Kategorie', 'Betrag (EUR)', 'Typ', 'Notiz']];

    let filtered = expenses.slice();
    if (year && month) filtered = filtered.filter(e => inMonth(e, year, month));
    else if (year) filtered = filtered.filter(e => inYear(e, year));
    filtered.sort((a, b) => byDateDesc(b, a));
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
    if (!isUnlocked()) throw new Error('err.locked');
    const { segs, query } = parse(path); // segs: ['api', ...]
    const res = segs[1];                  // 'expenses' | 'fixed-costs' | 'dashboard' | ...
    const id = segs[2];

    // --- settings ---
    if (res === 'settings') {
      if (method === 'GET') return Object.assign({}, VAULT.settings);
      if (method === 'PUT') {
        const a = Number(body && body.autolock);
        if (!AUTOLOCK_CHOICES.includes(a)) err('err.badValue');
        VAULT.settings.autolock = a; await persist(); return Object.assign({}, VAULT.settings);
      }
    }

    // --- categories ---
    // Name gekappt (60), Dubletten case-insensitiv abgewiesen. Umbenennen zieht die
    // category-Felder aller Einträge nach; Löschen verschiebt sie in die Auffang-Kategorie.
    if (res === 'categories') {
      const catName = x => String(x || '').trim().slice(0, 60);
      const exists = (name, exceptId) => VAULT.categories.find(c => c.id !== exceptId && c.name.toLowerCase() === name.toLowerCase());
      const retag = (from, to) => { [VAULT.expenses, VAULT.fixedCosts].forEach(arr => arr.forEach(e => { if (e.category === from) e.category = to; })); };
      // Zielkategorie beim Löschen — EINE Quelle für Route und Rückfrage-Dialog (Audit run-1 #9)
      if (method === 'GET' && id === 'delete-target') {
        const src = VAULT.categories.find(c => c.id === query.id);
        if (!src) err('err.notFound');
        return { target: deleteTarget(query.id) };
      }
      if (method === 'GET') return VAULT.categories.map(c => Object.assign({}, c));
      if (method === 'POST') {
        const name = catName(body && body.name);
        if (!name) err('err.required');
        if (exists(name)) err('err.catExists');
        const entry = { id: uuid(), name };
        VAULT.categories.push(entry); await persist(); return Object.assign({}, entry);
      }
      const idx = VAULT.categories.findIndex(c => c.id === id);
      if (method === 'PUT') {
        if (idx === -1) err('err.notFound');
        const name = catName(body && body.name);
        if (!name) err('err.required');
        if (exists(name, id)) err('err.catExists');
        const old = VAULT.categories[idx].name;
        VAULT.categories[idx].name = name;
        if (old !== name) retag(old, name);
        await persist(); return Object.assign({}, VAULT.categories[idx]);
      }
      if (method === 'DELETE') {
        if (idx === -1) err('err.notFound');
        if (VAULT.categories.length <= 1) err('err.lastCategory');
        const old = VAULT.categories[idx].name;
        const target = deleteTarget(id);
        VAULT.categories.splice(idx, 1);
        retag(old, target);
        await persist(); return { target };
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
      if (method === 'GET' && !id) return VAULT.fixedCosts.map(fc => Object.assign({}, fc));
      if (method === 'POST') {
        const { name, amount, period, category, note, since, usage } = body || {};
        const n = str(name, 200).trim();
        if (!n || amount === undefined) err('err.required');
        const entry = {
          id: uuid(), name: n, amount: routeAmount(amount),
          period: period === 'yearly' ? 'yearly' : 'monthly', category: str(category, 60).trim() || fallbackCategory(),
          note: str(note, 500), usage: normalizeUsage(usage), active: true, deactivatedAt: null,
          // since: null = „gilt für alle Monate" (leeres Feld bleibt leer, wird NICHT zu heute — Audit run-1 #2)
          since: since === undefined ? todayISO() : dateOrNull(since)
        };
        VAULT.fixedCosts.push(entry); await persist(); return entry;
      }
      const idx = VAULT.fixedCosts.findIndex(fc => fc.id === id);
      if (method === 'PATCH') {
        if (idx === -1) err('err.notFound');
        const fc = VAULT.fixedCosts[idx];
        const { name, amount, period, category, note, since, usage, active } = body || {};
        if (name !== undefined) { const n = str(name, 200).trim(); if (!n) err('err.required'); fc.name = n; }
        if (amount !== undefined) fc.amount = routeAmount(amount);
        if (period !== undefined) fc.period = period === 'yearly' ? 'yearly' : 'monthly';
        if (category !== undefined) fc.category = str(category, 60).trim() || fallbackCategory();
        if (note !== undefined) fc.note = str(note, 500);
        if (since !== undefined) fc.since = dateOrNull(since);
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
        if (idx === -1) err('err.notFound');
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
        if (!name || a === null) err('err.required');
        const entry = {
          id: uuid(), name: String(name).trim().slice(0, 200), amount: a,
          due: dateOrNull(due), note: String(note || '').slice(0, 500),
          done: false, doneAt: null, createdAt: todayISO()
        };
        VAULT.liabilities.push(entry); await persist(); return entry;
      }
      const idx = VAULT.liabilities.findIndex(l => l.id === id);
      if (method === 'PATCH') {
        if (idx === -1) err('err.notFound');
        const l = VAULT.liabilities[idx];
        const { name, amount, due, note, done } = body || {};
        if (name !== undefined) l.name = String(name).trim().slice(0, 200);
        if (amount !== undefined) { const a = amt(amount); if (a === null) err('err.badAmount'); l.amount = a; }
        if (due !== undefined) l.due = dateOrNull(due);
        if (note !== undefined) l.note = String(note || '').slice(0, 500);
        if (done !== undefined) {
          l.done = done === true;
          l.doneAt = l.done ? todayISO() : null;
        }
        await persist(); return l;
      }
      if (method === 'DELETE') {
        if (idx === -1) err('err.notFound');
        VAULT.liabilities.splice(idx, 1); await persist(); return null;
      }
    }

    // --- expenses ---
    if (res === 'expenses') {
      if (method === 'GET' && !id) {
        let list = VAULT.expenses.map(e => Object.assign({}, e));
        const y = query.year ? parseInt(query.year) : null, m = query.month ? parseInt(query.month) : null;
        if (y && m) list = list.filter(e => inMonth(e, y, m));
        else if (y) list = list.filter(e => inYear(e, y));
        else if (m) list = list.filter(e => e.date.slice(5, 7) === String(m).padStart(2, '0'));
        list.sort(byDateDesc);
        return list;
      }
      if (method === 'POST') {
        const { name, amount, category, date, note } = body || {};
        const n = str(name, 200).trim();
        if (!n || amount === undefined) err('err.required');
        const entry = {
          id: uuid(), name: n, amount: routeAmount(amount),
          category: str(category, 60).trim() || fallbackCategory(), date: dateOrNull(date) || todayISO(), note: str(note, 500)
        };
        VAULT.expenses.push(entry); await persist(); return entry;
      }
      const idx = VAULT.expenses.findIndex(e => e.id === id);
      if (method === 'PATCH') {
        if (idx === -1) err('err.notFound');
        const e = VAULT.expenses[idx];
        const { name, amount, category, date, note } = body || {};
        if (name !== undefined) { const n = str(name, 200).trim(); if (!n) err('err.required'); e.name = n; }
        if (amount !== undefined) e.amount = routeAmount(amount);
        if (category !== undefined) e.category = str(category, 60).trim() || fallbackCategory();
        if (date !== undefined) e.date = dateOrNull(date) || e.date;
        if (note !== undefined) e.note = str(note, 500);
        await persist(); return e;
      }
      if (method === 'DELETE') {
        if (idx === -1) err('err.notFound');
        VAULT.expenses.splice(idx, 1); await persist(); return null;
      }
    }

    throw new Error('err.route');
  }

  window.LocalDB = {
    hasVault, isUnlocked, setup, unlock, lock, changePassword,
    exportVaultRaw, checkBackup, restoreVault,
    csvExport, csvFixedSummary
  };
  window.apiFetch = apiFetch;
})();
