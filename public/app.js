'use strict';
// app.js — UI-Logik des Ausgaben-Trackers. Klassisches Skript (keine Module): die Funktionen sind
// global, damit die E2E-Suiten (verify-*.mjs) sie direkt aufrufen können.
const APP_VERSION = '1.12';   // Anzeige in den Einstellungen; muss VERSION_NAME in apk/VERSION entsprechen (build-www.sh setzt es aus VERSION, check-version.mjs prüft es)

const monthName = (i) => I18N.monthName(i);        // lokalisierter Monatsname (Januar / January)
const monthShort = (i) => I18N.monthName(i, true); // kurz (Jan)

// „Heute“ wird beim Entsperren (init) und beim Zurückkehren in die App (visibilitychange) neu gesetzt: die APK läuft tagelang,
// ein beim Start festgelegtes Datum ließ Übersicht und Jahr nach einem Monatswechsel im alten Monat stehen (Review v1.12 R2 M-1)
let today = new Date();
let dashYear = today.getFullYear();
let dashMonth = today.getMonth() + 1;
let annualYear = today.getFullYear();
let categories = [];
let settings = { autolock: 5 };
let editingExpenseId = null;
let editingFixedId = null;
let selectedPeriod = 'monthly';
let editingLiabId = null;
let pendingLiabId = null;   // Verbindlichkeit, die nach dem Speichern der Ausgabe abgehakt wird
let expKind = 'expense';    // Art im Ausgaben-Modal (v1.12): 'expense' | 'income'
// Kategorie je Art (v1.12): kindCat = zuletzt GESPEICHERTE Kategorie (bleibt zwischen zwei Einträgen stehen; bis v1.11 blieb sogar eine nur
// gewählte, abgebrochene Auswahl stehen, weil das Formular das Auswahlfeld nie zurücksetzte),
// sessCat = Wahl im offenen Formular (Hin- und Rückwechsel der Art verliert nichts, auch keine verwaiste Kategorie). Beides Nutzerdaten → clearRendered.
let kindCat = { expense: '', income: '' };
let sessCat = {};
let dashData = null;        // letzte Monatsdaten (für Filter ohne erneutes Laden)
let searchQ = '';           // Suchtext der Übersicht (nur im RAM)
let catFilter = new Set();  // gewählte Kategorie-Chips (leer = alle)
let lastFocus = null;       // Fokus-Rückgabe nach dem Schließen eines Modals

// --- Helpers ---
function eur(n) {
  // Hart auf Zahl zwingen — ein String aus einem manipulierten .vault würde sonst
  // roh (unescaped) ins innerHTML laufen (String.toLocaleString gibt ihn 1:1 zurück).
  n = Number(n); if (!isFinite(n)) n = 0;
  return n.toLocaleString(I18N.locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}
function formatDateDE(dateStr) {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return '';
  const [y, m, d] = dateStr.split('-');
  return `${d}.${m}.${y}`;
}
function todayISO() {
  // Immer frisch (die APK läuft tagelang) und in LOKALER Zeit — toISOString wäre UTC (Audit run-1 #3)
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const unlocked = () => window.LocalDB.isUnlocked();
// Select auf einen Wert setzen, der nicht in der Liste steht (verwaiste Kategorie aus einem Backup):
// temporäre Option statt stiller Umbuchung auf die erste Option (Audit run-1 #10)
function selectValue(sel, value) {
  if (![...sel.options].find(o => o.value === value)) {
    const o = document.createElement('option'); o.value = value; o.textContent = value; sel.appendChild(o);
  }
  sel.value = value;
  syncCombo(sel.id);
}
// Text- UND attributsicher (auch " und ' werden ersetzt) — gilt für alles, was in
// Template-Strings landet, inkl. data-id-Attribute der Aktionsbuttons.
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function escapeHtml(str) { return String(str).replace(/[&<>"']/g, c => ESC[c]); }
const $ = (id) => document.getElementById(id);
// Suche: Groß-/Kleinschreibung und Akzente ignorieren (ä = a, é = e)
function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }

// --- Eigene Auswahlfelder (wie Alien Pass v1.5) ---
// Die aufgeklappte System-Liste eines <select> ist grau und nicht gestaltbar. Das native <select> bleibt deshalb
// unsichtbar als Wertspeicher (.combo-native): $('exp-category').value, selectValue() und die data-change-Delegation
// gelten unverändert. Darüber liegen Knopf #cb-<id> und Menü #cm-<id>. Kategorienamen sind entschlüsselte Nutzerdaten →
// Menüeinträge nur per textContent/dataset, und closeMenus() versteckt UND leert jedes Menü (auch beim Sperren).
function closeMenus() {
  document.querySelectorAll('.combo-menu').forEach(m => { m.classList.add('hidden'); m.replaceChildren(); });
  document.body.classList.remove('menu-open');
}
function syncCombo(id) {
  const sel = $(id), lab = $('cb-' + id);
  if (!sel || !lab) return;
  const o = sel.options[sel.selectedIndex];
  lab.textContent = o ? o.textContent : '';
}
function syncCombos() { document.querySelectorAll('.combo-native').forEach(sel => syncCombo(sel.id)); }
function toggleCombo(id) {
  const menu = $('cm-' + id), sel = $(id);
  if (!menu || !sel) return;
  const wasOpen = !menu.classList.contains('hidden');
  closeMenus();
  if (wasOpen || !sel.options.length) return;
  for (const o of sel.options) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'combo-opt' + (o.value === sel.value ? ' on' : '');
    b.textContent = o.textContent;
    b.dataset.action = 'chooseOpt'; b.dataset.arg = o.value; b.dataset.sel = id;
    menu.appendChild(b);
  }
  menu.classList.remove('hidden');
  document.body.classList.add('menu-open');   // blendet den schwebenden Plus-Knopf aus, der sonst über dem Menü liegt
  menu.scrollIntoView({ block: 'nearest' });   // im Bottom-Sheet ragt das Menü sonst unter den sichtbaren Bereich
  const on = menu.querySelector('.combo-opt.on');
  if (on) on.scrollIntoView({ block: 'nearest' });
}
function chooseOpt(value, el) {
  const id = el && el.dataset.sel, sel = id ? $(id) : null;
  closeMenus();
  if (!sel || sel.tagName !== 'SELECT' || ![...sel.options].some(o => o.value === value)) return;
  const changed = sel.value !== value;
  sel.value = value;
  syncCombo(id);
  const lab = $('cb-' + id); if (lab) lab.parentElement.focus();
  if (changed) sel.dispatchEvent(new Event('change', { bubbles: true }));   // wie nativ: nur bei echter Änderung
}

// apiFetch (gleiche Signatur) wird von local-api.js als window.apiFetch bereitgestellt.

// --- Kategorien + Einstellungen laden ---
async function loadCategories() {
  try {
    categories = await apiFetch('GET', '/api/categories');
  } catch (e) {
    categories = [];
  }
  populateCategorySelects();
}
async function loadSettings() {
  try { settings = await apiFetch('GET', '/api/settings'); } catch (e) { settings = { autolock: 5 }; }
}

// Zwei Kategorienlisten seit v1.12: Ausgaben (auch Fixkosten) und Einnahmen. kind fehlt nie (Sanitizer), trotzdem defensiv.
const catsOf = (kind) => categories.filter(c => (c.kind === 'income' ? 'income' : 'expense') === kind);
const catOpts = (kind) => catsOf(kind).map(c => `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)}</option>`).join('');
function populateCategorySelects() {
  $('exp-category').innerHTML = catOpts(expKind);
  $('fc-category').innerHTML = catOpts('expense');
  ['exp-category', 'fc-category'].forEach(syncCombo);
  populateExportYears();
  populateExportMonths();
}
// Export-Jahre: laufendes Jahr + fünf zurück; Auswahl bleibt erhalten. Auch beim Jahreswechsel aus followToday (R3 N2) — dort NICHT
// populateCategorySelects, das baut exp-category neu und zerstört im offenen Formular die Wahl (sessCat, verwaiste Option).
function populateExportYears() {
  const sel = $('export-year'), prev = sel.value, curYear = today.getFullYear();
  let yearOpts = '';
  for (let y = curYear; y >= curYear - 5; y--) yearOpts += `<option value="${y}">${y}</option>`;
  sel.innerHTML = yearOpts;
  if (prev && [...sel.options].some(o => o.value === prev)) sel.value = prev;
  syncCombo('export-year');
}

// Monats-Dropdown im Export-Tab lokalisiert befüllen (Auswahl bleibt erhalten)
function populateExportMonths() {
  const sel = $('export-month');
  const prev = sel.value;
  let html = `<option value="">${escapeHtml(I18N.t('export.wholeYear'))}</option>`;
  for (let m = 1; m <= 12; m++) html += `<option value="${m}">${escapeHtml(monthName(m - 1))}</option>`;
  sel.innerHTML = html;
  sel.value = prev;
  syncCombo('export-month');
}

// --- Tab switching ---
function showTab(name) {
  followToday(false);   // Tagwechsel im Vordergrund: Tab rendert mit frischem Datum (R3 N3)
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('visible'));
  $('tab-' + name).classList.add('visible');
  if (name === 'dashboard') loadDashboard();
  if (name === 'annual') loadAnnual();
  if (name === 'fixed') loadFixedCosts();
  if (name === 'liab') loadLiabilities();
  if (name === 'settings') renderSettings();
}
document.querySelector('.tabs').addEventListener('click', e => {
  const tab = e.target.closest('.nav-tab');
  if (tab) showTab(tab.dataset.tab);
});

// --- DASHBOARD ---
// Monatsnummer (Jahr*12+Monat) — „Folgemonat“ ist gesperrt ab dem laufenden Monat, nicht nur GENAU dort (Uhr zurückgestellt, R3 H4)
const ymNum = (y, m) => y * 12 + m;
const atOrAfterNow = () => ymNum(dashYear, dashMonth) >= ymNum(today.getFullYear(), today.getMonth() + 1);
function updateMonthLabel() {
  $('month-label').innerHTML = `${escapeHtml(monthName(dashMonth - 1))} <span class="year-hint">${dashYear}</span>`;
  $('btn-next-month').disabled = atOrAfterNow();
}

function prevMonth() {
  dashMonth--;
  if (dashMonth < 1) { dashMonth = 12; dashYear--; }
  updateMonthLabel();
  loadDashboard();
}

function nextMonth() {
  if (followToday(true) || atOrAfterNow()) return;   // erst Datum nachziehen (rückt die Ansicht ggf. selbst vor)
  dashMonth++;
  if (dashMonth > 12) { dashMonth = 1; dashYear++; }
  updateMonthLabel();
  loadDashboard();
}

async function loadDashboard() {
  updateMonthLabel();
  try {
    const data = await apiFetch('GET', `/api/dashboard?year=${dashYear}&month=${dashMonth}`);
    if (!unlocked()) return;   // nach einem await nie mehr Entschlüsseltes rendern (Sperre könnte dazwischen liegen)
    renderDashboard(data);
  } catch (e) {
    showError(tErr(e));
  }
}

const monthlyOf = (fc) => fc.period === 'yearly' ? fc.amount / 12 : fc.amount;

// Bilanz (v1.12): Saldo mit Vorzeichen (typografisches Minus), Sparquote = Saldo / Einnahmen, nur bei Einnahmen > 0.
// Vorzeichen, Orange und Quote aus dem auf Cent GERUNDETEN Saldo — sonst „−0,00 €“ in Orange bei 1,4e-14 (Review v1.12 N5)
const cents = (n) => { n = Number(n); return isFinite(n) ? Math.round(n * 100) / 100 : 0; };
const isNeg = (n) => cents(n) < 0;
function signedEur(n) { n = cents(n); return (n > 0 ? '+' : n < 0 ? '−' : '') + eur(Math.abs(n)); }
function savingsRate(income, balance) {
  income = cents(income); balance = cents(balance);
  if (!(income > 0)) return null;
  const p = Math.round(balance / income * 100);
  return p < 0 ? '−' + Math.abs(p) : String(p);
}
function balanceCardHtml(title, income, expenses, balance) {
  const rate = savingsRate(income, balance), neg = isNeg(balance) ? ' bal-neg' : '';
  return `
    <div class="card balance-card">
      <h2>${escapeHtml(title)}</h2>
      <div class="bal-row"><span class="bal-label">${I18N.t('dash.income')}</span><span class="bal-val">${eur(income)}</span></div>
      <div class="bal-row"><span class="bal-label">${I18N.t('dash.expenses')}</span><span class="bal-val">${eur(expenses)}</span></div>
      <div class="bal-row bal-sum"><span class="bal-label">${I18N.t('dash.balance')}</span><span class="bal-val${neg}">${signedEur(balance)}</span></div>
      ${rate !== null ? `<div class="bal-rate${neg}">${escapeHtml(I18N.t('dash.savingsRate', { p: rate }))}</div>` : ''}
    </div>`;
}

function renderDashboard(data) {
  dashData = data;
  // Bilanz-Karte erst, wenn der Tresor überhaupt Einnahmen kennt — ohne Einnahmen sieht die Übersicht aus wie bis v1.11
  $('dash-balance').innerHTML = data.has_income
    ? balanceCardHtml(I18N.t('dash.balanceTitle', { m: monthName(data.month - 1) }), data.income_total, data.total, data.balance) : '';
  // Summary cards
  let deltaHtml = '—';
  if (data.delta_pct !== null) {
    const sign = data.delta_pct >= 0 ? '+' : '';
    const cls = data.delta_pct >= 0 ? 'negative' : 'positive';
    deltaHtml = `<span class="${cls}">${sign}${data.delta_pct.toFixed(1)} %</span>`;
  }
  $('summary-cards').innerHTML = `
    <div class="summary-card">
      <div class="label">${I18N.t('dash.total')}</div>
      <div class="value">${eur(data.total)}</div>
      <div class="sub">${escapeHtml(monthName(data.month - 1))}</div>
    </div>
    <div class="summary-card">
      <div class="label">${I18N.t('dash.fixed')}</div>
      <div class="value">${eur(data.fixed_total)}</div>
      <div class="sub">${I18N.t('dash.monthlyLoad')}</div>
    </div>
    <div class="summary-card">
      <div class="label">${I18N.t('dash.variable')}</div>
      <div class="value">${eur(data.variable_total)}</div>
      <div class="sub">${I18N.t('dash.entered')}</div>
    </div>
    <div class="summary-card">
      <div class="label">${I18N.t('dash.vsPrev')}</div>
      <div class="value">${deltaHtml}</div>
      <div class="sub">${I18N.t('dash.before', { x: eur(data.prev_total) })}</div>
    </div>
  `;

  // Aufschlüsselung nach Kategorie (Fixkosten-Monatsanteil + variable Ausgaben), sortiert nach Summe
  const sums = new Map();
  data.active_fixed_costs.forEach(fc => sums.set(fc.category, (sums.get(fc.category) || 0) + monthlyOf(fc)));
  data.current_expenses.forEach(e => sums.set(e.category, (sums.get(e.category) || 0) + Number(e.amount || 0)));
  const rows = [...sums.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const max = rows.length ? rows[0][1] : 0;
  $('dash-cats').innerHTML = rows.length ? `
    <div class="card">
      <h2>${I18N.t('dash.byCategory')}</h2>
      <div class="cat-bars">${rows.map(([name, v]) => `
        <div class="cat-bar">
          <span class="cb-name">${escapeHtml(name)}</span>
          <span class="cb-val">${eur(v)}<span class="cb-pct">${data.total > 0 ? Math.round(v / data.total * 100) : 0} %</span></span>
          <span class="cb-track"><span class="cb-fill" style="width:${max ? Math.round(v / max * 100) : 0}%"></span></span>
        </div>`).join('')}
      </div>
    </div>` : '';

  // Kategorie-Chips: nur Kategorien mit Einträgen im Monat (auch Einnahmen, v1.12); gewählte Chips bleiben, wenn noch vorhanden
  const chipCats = new Set(sums.keys());
  (data.current_incomes || []).forEach(e => chipCats.add(e.category));
  const present = [...chipCats].sort((a, b) => a.localeCompare(b, I18N.locale()));
  catFilter = new Set([...catFilter].filter(c => present.includes(c)));
  $('dash-chips').innerHTML = present.length ? [
    `<button class="chip ${catFilter.size ? '' : 'on'}" data-action="chipAll">${I18N.t('dash.filterAll')}</button>`,
    ...present.map(c => `<button class="chip ${catFilter.has(c) ? 'on' : ''}" data-action="chip" data-arg="${escapeHtml(c)}">${escapeHtml(c)}</button>`)
  ].join('') : '';

  renderDashboardList();
}

// Listen der Übersicht mit Suchtext + Kategorie-Chips filtern (ohne Neuladen)
function renderDashboardList() {
  const data = dashData;
  if (!data) return;
  const q = norm(searchQ.trim());
  const match = (e) => (!catFilter.size || catFilter.has(e.category)) &&
    (!q || norm(e.name).includes(q) || norm(e.note).includes(q) || norm(e.category).includes(q));
  const fixed = data.active_fixed_costs.filter(match);
  const exps = data.current_expenses.filter(match);
  const incomes = data.current_incomes || [];
  const incs = incomes.filter(match);
  const filtering = q || catFilter.size;

  let fixedHtml = '';
  if (data.active_fixed_costs.length === 0) {
    fixedHtml = `<div class="empty-state">${ICON.svg('repeat', 'lg')}<div>${I18N.t('dash.emptyFixed')}</div></div>`;
  } else if (fixed.length === 0) {
    fixedHtml = `<div class="empty-state">${I18N.t('dash.noMatch')}</div>`;
  } else {
    fixedHtml = fixed.map(fc => {
      const monthly = monthlyOf(fc);
      const periodLabel = fc.period === 'yearly'
        ? I18N.t('fixed.yearToMonth', { a: eur(fc.amount), b: eur(monthly) })
        : I18N.t('fixed.perMonth', { x: eur(monthly) });
      return `
        <div class="expense-item">
          <div class="item-left">
            <div class="item-name">${escapeHtml(fc.name)}</div>
            <div class="item-meta">
              <span class="cat-tag">${escapeHtml(fc.category)}</span>
              <span class="item-note">${escapeHtml(periodLabel)}</span>
              ${usageBadge(fc)}
            </div>
          </div>
          <div class="item-right">
            <div class="item-amount">${eur(monthly)}</div>
            <div class="item-actions">
              <button class="action-btn" data-action="openFixed" data-id="${escapeHtml(fc.id)}" title="${escapeHtml(I18N.t('modal.fixedEdit'))}" aria-label="${escapeHtml(I18N.t('modal.fixedEdit'))}">${ICON.svg('edit')}</button>
            </div>
          </div>
        </div>`;
    }).join('');
  }

  // Ausgabe und Einnahme (v1.12) teilen das Zeilen-Markup; Einnahmen tragen „+“ und eigene Knopf-Titel
  const entryHtml = (e) => {
    const inc = e.kind === 'income';
    const editT = escapeHtml(I18N.t(inc ? 'modal.incomeEdit' : 'modal.expenseEdit'));
    const delT = escapeHtml(I18N.t(inc ? 'confirm.delIncome' : 'confirm.delExpense'));
    return `
      <div class="expense-item${inc ? ' income-item' : ''}">
        <div class="item-left">
          <div class="item-name">${escapeHtml(e.name)}</div>
          <div class="item-meta">
            <span class="cat-tag">${escapeHtml(e.category)}</span>
            <span class="item-date">${formatDateDE(e.date)}</span>
            ${e.note ? `<span class="item-note">${escapeHtml(e.note)}</span>` : ''}
          </div>
        </div>
        <div class="item-right">
          <div class="item-amount${inc ? ' inc' : ''}">${inc ? '+' : ''}${eur(e.amount)}</div>
          <div class="item-actions">
            <button class="action-btn" data-action="openExpense" data-id="${escapeHtml(e.id)}" title="${editT}" aria-label="${editT}">${ICON.svg('edit')}</button>
            <button class="action-btn danger" data-action="deleteExpense" data-id="${escapeHtml(e.id)}" title="${delT}" aria-label="${delT}">${ICON.svg('trash')}</button>
          </div>
        </div>
      </div>`;
  };

  let expHtml = '';
  if (data.current_expenses.length === 0) {
    expHtml = `<div class="empty-state">${ICON.svg('coins', 'lg')}<div>${I18N.t('dash.emptyExpense')}</div></div>`;
  } else if (exps.length === 0) {
    expHtml = `<div class="empty-state">${I18N.t('dash.noMatch')}</div>`;
  } else {
    expHtml = exps.map(entryHtml).join('');
  }

  let incHtml = '';
  if (data.has_income) {
    if (incomes.length === 0) incHtml = `<div class="empty-state">${ICON.svg('coins', 'lg')}<div>${I18N.t('dash.emptyIncome')}</div></div>`;
    else if (incs.length === 0) incHtml = `<div class="empty-state">${I18N.t('dash.noMatch')}</div>`;
    else incHtml = incs.map(entryHtml).join('');
  }

  const fixedSum = fixed.reduce((s, fc) => s + monthlyOf(fc), 0);
  const expSum = exps.reduce((s, e) => s + Number(e.amount || 0), 0);
  const incSum = incs.reduce((s, e) => s + Number(e.amount || 0), 0);
  const total = data.active_fixed_costs.length + data.current_expenses.length + incomes.length;
  $('dashboard-content').innerHTML = `
    ${filtering ? `<div class="muted" style="margin-bottom:4px">${I18N.t('dash.filtered', { n: fixed.length + exps.length + incs.length, total })}</div>` : ''}
    <div class="section-hd">
      <h2>${I18N.t('dash.sectionFixed')}</h2>
      <span class="section-total">${eur(filtering ? fixedSum : data.fixed_total)}</span>
    </div>
    <div class="item-list">${fixedHtml}</div>
    <div class="section-hd" style="margin-top:24px">
      <h2>${I18N.t('dash.sectionVariable')}</h2>
      <span class="section-total">${eur(filtering ? expSum : data.variable_total)}</span>
    </div>
    <div class="item-list">${expHtml}</div>
    ${data.has_income ? `
    <div class="section-hd" style="margin-top:24px">
      <h2>${I18N.t('dash.sectionIncome')}</h2>
      <span class="section-total inc">+${eur(filtering ? incSum : data.income_total)}</span>
    </div>
    <div class="item-list">${incHtml}</div>` : ''}
  `;
}

function usageBadge(fc) {
  return fc.usage && fc.usage !== 'privat'
    ? `<span class="usage-badge">${ICON.svg('briefcase')} ${escapeHtml(I18N.t('usage.' + fc.usage))}</span>` : '';
}

function setChip(name) {
  if (name === null) catFilter.clear();
  else if (catFilter.has(name)) catFilter.delete(name);
  else catFilter.add(name);
  document.querySelectorAll('#dash-chips .chip').forEach(ch => {
    const c = ch.dataset.arg;
    ch.classList.toggle('on', c === undefined ? catFilter.size === 0 : catFilter.has(c));
  });
  renderDashboardList();
}
$('dash-search').addEventListener('input', e => { searchQ = e.target.value; renderDashboardList(); });

// --- ANNUAL ---
function prevYear() { annualYear--; loadAnnual(); }
function nextYear() {
  if (followToday(true) || annualYear >= today.getFullYear()) return;
  annualYear++;
  loadAnnual();
}

async function loadAnnual() {
  $('year-label').textContent = annualYear;
  $('btn-next-year').disabled = annualYear >= today.getFullYear();
  try {
    const data = await apiFetch('GET', `/api/annual?year=${annualYear}`);
    if (!unlocked()) return;
    renderAnnual(data);
  } catch (e) {
    showError(tErr(e));
  }
}

function renderAnnual(data) {
  const nowD = new Date();   // echtes Datum, nicht das gemerkte — „künftig“ darf nie einen schon begonnenen Monat treffen
  const curYearMonth = `${nowD.getFullYear()}-${String(nowD.getMonth() + 1).padStart(2, '0')}`;
  const dash = '<span class="dash">—</span>';
  const rows = data.months.map(m => {
    const isCurrent = m.yearMonth === curYearMonth;
    const isFuture = m.yearMonth > curYearMonth;
    let cls = '';
    if (isCurrent) cls = 'current-month';
    if (isFuture) cls = 'future-month';
    return `
      <tr class="${cls}">
        <td class="month-name">${escapeHtml(monthName(m.month - 1))}</td>
        <td class="col-fixed">${m.fixed_total > 0 ? eur(m.fixed_total) : dash}</td>
        <td class="col-variable">${m.variable_total > 0 ? eur(m.variable_total) : dash}</td>
        <td class="col-total">${m.total > 0 ? eur(m.total) : dash}</td>
      </tr>`;
  }).join('');

  $('annual-content').innerHTML = `
    <div class="annual-wrap">
      <table class="annual-table">
        <thead>
          <tr>
            <th>${I18N.t('annual.month')}</th>
            <th>${I18N.t('annual.fixed')}</th>
            <th>${I18N.t('annual.variable')}</th>
            <th>${I18N.t('annual.total')}</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
          <tr class="total-row">
            <td>${I18N.t('annual.totalYear', { year: data.year })}</td>
            <td>${eur(data.year_fixed)}</td>
            <td>${eur(data.year_variable)}</td>
            <td>${eur(data.year_total)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  `;

  // Bilanz-Tabelle (v1.12) als eigene Karte statt zwei weiterer Spalten — sechs Betragsspalten passen bei 360 px nicht nebeneinander.
  // Nur wenn der Tresor Einnahmen kennt; Monate ganz ohne Bewegung zeigen „—“. Künftige Monate bleiben leer und zählen nicht mit: die
  // Ausgaben-Tabelle rechnet dort Fixkosten als Projektion, Einnahmen gibt es noch keine — der Saldo wäre sonst stark negativ (Review v1.12 M1).
  // Im laufenden Jahr heißt die Summenzeile darum „Bis heute“.
  if (!data.has_income) { $('annual-balance').innerHTML = ''; return; }
  const sofar = data.months.filter(m => m.yearMonth <= curYearMonth);
  const yInc = sofar.reduce((s, m) => s + m.income_total, 0), yOut = sofar.reduce((s, m) => s + m.total, 0), yBal = yInc - yOut;
  const balRows = data.months.map(m => {
    const future = m.yearMonth > curYearMonth;
    const cls = m.yearMonth === curYearMonth ? 'current-month' : (future ? 'future-month' : '');
    const any = !future && (m.income_total > 0 || m.total > 0);
    return `
      <tr class="${cls}">
        <td class="month-name">${escapeHtml(monthName(m.month - 1))}</td>
        <td>${!future && m.income_total > 0 ? eur(m.income_total) : dash}</td>
        <td>${!future && m.total > 0 ? eur(m.total) : dash}</td>
        <td class="col-total${any && isNeg(m.balance) ? ' bal-neg' : ''}">${any ? signedEur(m.balance) : dash}</td>
      </tr>`;
  }).join('');
  const rate = savingsRate(yInc, yBal), negY = isNeg(yBal) ? 'bal-neg' : '';
  $('annual-balance').innerHTML = `
    <div class="card">
      <h2>${escapeHtml(I18N.t('annual.balanceTitle', { year: data.year }))}</h2>
      <div class="annual-wrap">
        <table class="annual-table balance-table">
          <thead>
            <tr>
              <th>${I18N.t('annual.month')}</th>
              <th>${I18N.t('annual.income')}</th>
              <th>${I18N.t('annual.expenses')}</th>
              <th>${I18N.t('annual.balance')}</th>
            </tr>
          </thead>
          <tbody>
            ${balRows}
            <tr class="total-row">
              <td>${I18N.t(data.year >= nowD.getFullYear() ? 'annual.toDate' : 'annual.total')}</td>
              <td>${eur(yInc)}</td>
              <td>${eur(yOut)}</td>
              <td class="${negY}">${signedEur(yBal)}</td>
            </tr>
            ${rate !== null ? `<tr class="rate-row"><td colspan="3">${I18N.t('annual.savingsRate')}</td><td class="${negY}">${escapeHtml(rate)} %</td></tr>` : ''}
          </tbody>
        </table>
      </div>
    </div>`;
}

// --- FIXED COSTS TAB ---
async function loadFixedCosts() {
  try {
    const list = await apiFetch('GET', '/api/fixed-costs');
    if (!unlocked()) return;
    renderFixedCosts(list);
  } catch (e) {
    showError(tErr(e));
  }
}

function renderFixedCosts(list) {
  const active = list.filter(fc => fc.active);
  const inactive = list.filter(fc => !fc.active);

  const monthlyTotal = active.reduce((s, fc) => s + monthlyOf(fc), 0);
  const yearlyTotal = active.reduce((s, fc) => s + (fc.period === 'yearly' ? fc.amount : fc.amount * 12), 0);

  $('fc-monthly-total').textContent = eur(monthlyTotal);
  $('fc-yearly-total').textContent = eur(yearlyTotal);

  function renderItem(fc) {
    const monthly = monthlyOf(fc);
    const periodLabel = fc.period === 'yearly'
      ? I18N.t('fixed.perYear', { x: eur(fc.amount) })
      : I18N.t('fixed.perMonth', { x: eur(fc.amount) });
    const inactiveInfo = !fc.active && fc.deactivatedAt
      ? `<span class="inactive-label">${I18N.t('fixed.inactiveSince', { date: formatDateDE(fc.deactivatedAt) })}</span>`
      : fc.active ? '' : `<span class="inactive-label">${I18N.t('fixed.inactive')}</span>`;
    const id = escapeHtml(fc.id);
    return `
      <div class="fixed-item ${fc.active ? '' : 'inactive'}">
        <div class="item-left">
          <div class="item-name">${escapeHtml(fc.name)}</div>
          <div class="item-meta">
            <span class="cat-tag">${escapeHtml(fc.category)}</span>
            <span class="item-note">${escapeHtml(periodLabel)}</span>
            ${usageBadge(fc)}
            ${fc.since ? `<span class="item-date">${I18N.t('fixed.sinceShort', { m: monthShort(new Date(fc.since + 'T00:00:00').getMonth()), y: new Date(fc.since + 'T00:00:00').getFullYear() })}</span>` : ''}
            ${inactiveInfo}
          </div>
          ${fc.note ? `<div class="item-subnote">${escapeHtml(fc.note)}</div>` : ''}
        </div>
        <div class="item-right">
          <div>
            <div class="item-amount">${eur(monthly)}<span class="item-period">${I18N.t('fixed.perMoShort')}</span></div>
          </div>
          <div class="item-actions">
            <button class="action-btn" data-action="openFixed" data-id="${id}" title="${escapeHtml(I18N.t('modal.fixedEdit'))}" aria-label="${escapeHtml(I18N.t('modal.fixedEdit'))}">${ICON.svg('edit')}</button>
            ${fc.active
              ? `<button class="action-btn danger" data-action="toggleFixed" data-id="${id}" data-arg="0" title="${escapeHtml(I18N.t('toast.deactivated'))}" aria-label="${escapeHtml(I18N.t('toast.deactivated'))}">${ICON.svg('pause')}</button>`
              : `<button class="action-btn success" data-action="toggleFixed" data-id="${id}" data-arg="1" title="${escapeHtml(I18N.t('toast.activated'))}" aria-label="${escapeHtml(I18N.t('toast.activated'))}">${ICON.svg('play')}</button>
                 <button class="action-btn danger" data-action="deleteFixed" data-id="${id}" title="${escapeHtml(I18N.t('confirm.delFixed'))}" aria-label="${escapeHtml(I18N.t('confirm.delFixed'))}">${ICON.svg('trash')}</button>`
            }
          </div>
        </div>
      </div>`;
  }

  let html = '';
  if (active.length === 0 && inactive.length === 0) {
    html = `<div class="empty-state">${ICON.svg('repeat', 'lg')}<div>${I18N.t('fixed.empty')}</div></div>`;
  } else {
    html += `<div class="item-list">${active.sort((a, b) => b.amount - a.amount).map(renderItem).join('')}</div>`;
    if (inactive.length > 0) {
      html += `<div class="inactive-section-title">${I18N.t('fixed.inactiveSection')}</div>`;
      html += `<div class="item-list">${inactive.map(renderItem).join('')}</div>`;
    }
  }

  $('fixed-content').innerHTML = html;
}

// --- MODAL-HELFER (Öffnen/Schließen, Fokus zurückgeben, ESC) ---
function openModal(id, focusId) {
  lastFocus = document.activeElement;
  $(id).classList.add('open');
  setTimeout(() => { const f = focusId && $(focusId); if (f) f.focus(); }, 100);
}
function closeModal(id) {
  const m = $(id);
  if (!m.classList.contains('open')) return;
  closeMenus();
  m.classList.remove('open');
  if (lastFocus && document.body.contains(lastFocus) && typeof lastFocus.focus === 'function') lastFocus.focus();
  lastFocus = null;
}

// --- EXPENSE MODAL (Ausgabe ODER Einnahme, v1.12) ---
// Titel per data-i18n mitführen, damit ein Sprachwechsel bei offenem Modal den richtigen Text setzt (applyStatic)
function setExpTitle(key) { const h = $('expense-modal-title'); h.dataset.i18n = key; h.textContent = I18N.t(key); }
// Nur Zustand, Knöpfe und Platzhalter — füllt keine Kategorien (clearRendered ruft das beim Sperren)
function markKind(kind) {
  expKind = kind === 'income' ? 'income' : 'expense';
  document.querySelectorAll('.kind-pill').forEach(el => {
    const on = el.dataset.kind === expKind;
    el.classList.toggle('active', on); el.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  const ph = expKind === 'income' ? 'ph.incName' : 'ph.expName', n = $('exp-name');
  n.dataset.i18nPh = ph; n.setAttribute('placeholder', I18N.t(ph));
}
// Umschalter Ausgabe/Einnahme: Titel und Kategorienliste folgen der Art. Kategorie: zuerst die Wahl dieser Art im offenen Formular
// (sessCat), sonst die zuletzt gespeicherte dieser Art (kindCat, nur wenn noch vorhanden), sonst die erste der Liste.
// fresh = neues Formular: die Auswahl des vorigen Formulars zählt nicht als Wahl dieser Sitzung.
function setKind(kind, fresh) {
  if (pendingLiabId) kind = 'expense';   // eine gebuchte Verbindlichkeit ist immer eine Ausgabe
  const sel = $('exp-category');
  if (fresh) sessCat = {}; else if (sel.value) sessCat[expKind] = sel.value;
  markKind(kind);
  const inc = expKind === 'income';
  if (!pendingLiabId) setExpTitle(editingExpenseId ? (inc ? 'modal.incomeEdit' : 'modal.expenseEdit') : (inc ? 'modal.incomeAdd' : 'modal.expenseAdd'));
  sel.innerHTML = catOpts(expKind);
  const s = sessCat[expKind], k = kindCat[expKind];
  if (s) { selectValue(sel, s); return; }   // selectValue ruft syncCombo, legt eine verwaiste Kategorie als Option an
  if (k && [...sel.options].some(o => o.value === k)) sel.value = k;
  syncCombo('exp-category');
}

function openExpenseModal(id) {
  editingExpenseId = id || null;
  pendingLiabId = null;
  const isEdit = !!id;
  $('exp-kind-group').style.display = '';
  $('exp-date').value = todayISO();
  $('exp-name').value = '';
  $('exp-amount').value = '';
  $('exp-note').value = '';
  setKind('expense', true);
  if (isEdit) loadExpenseForEdit(id);
  openModal('modal-expense', 'exp-name');
}

async function loadExpenseForEdit(id) {
  try {
    const list = await apiFetch('GET', `/api/expenses?year=${dashYear}&month=${dashMonth}`);
    const exp = list.find(e => e.id === id);
    if (!exp || !unlocked() || editingExpenseId !== id) return;   // inzwischen gesperrt oder ein anderes Modal geöffnet
    setKind(exp.kind, true);
    $('exp-name').value = exp.name;
    $('exp-amount').value = exp.amount;
    $('exp-date').value = exp.date;
    $('exp-note').value = exp.note || '';
    selectValue($('exp-category'), exp.category);
  } catch (e) { /* ignore */ }
}

function closeExpenseModal() {
  closeModal('modal-expense');
  editingExpenseId = null;
  pendingLiabId = null;
}

async function saveExpense() {
  const name = $('exp-name').value.trim();
  const amount = parseFloat($('exp-amount').value);
  if (!name || !amount || amount <= 0) { showToast(I18N.t('toast.reqFields'), true); return; }

  const kind = pendingLiabId ? 'expense' : expKind;   // VOR dem await festhalten
  const inc = kind === 'income';
  const body = {
    kind,
    name,
    amount,
    category: $('exp-category').value,
    date: $('exp-date').value || todayISO(),
    note: $('exp-note').value.trim()
  };

  const btn = $('btn-exp-save');
  btn.disabled = true;
  try {
    if (editingExpenseId) {
      await apiFetch('PATCH', `/api/expenses/${editingExpenseId}`, body);
      showToast(I18N.t(inc ? 'toast.incUpdated' : 'toast.expUpdated'));
    } else {
      const liabId = pendingLiabId;   // VOR dem await sichern (Overlay-Klick könnte die Variable währenddessen nullen)
      await apiFetch('POST', '/api/expenses', body);
      if (liabId) {
        await apiFetch('PATCH', `/api/liabilities/${liabId}`, { done: true });
        showToast(I18N.t('toast.liabBooked'));
        loadLiabilities();
      } else {
        showToast(I18N.t(inc ? 'toast.incSaved' : 'toast.expSaved'));
      }
    }
    if (unlocked()) kindCat[kind] = body.category;   // nächstes Formular dieser Art startet mit dieser Kategorie (wie bis v1.11)
    closeExpenseModal();
    loadDashboard();
  } catch (e) {
    showToast(tErr(e), true);
  } finally {
    btn.disabled = false;
  }
}

// Löschen mit eigener Rückfrage und „Rückgängig“ im Toast (v1.9): kein Papierkorb, der Eintrag kommt für UNDO_MS an seine alte Stelle
// zurück (Route /api/expenses/restore). Nach dem await: Sperre kann gelaufen sein → Zustand neu prüfen; die Route meldet einen inzwischen
// fehlenden Eintrag als err.notFound.
async function deleteExpense(id) {
  const shown = dashData ? [...(dashData.current_expenses || []), ...(dashData.current_incomes || [])] : [];
  const e0 = shown.find(x => x.id === id) || null;
  const line = e0 ? '\n\n' + e0.name + ' · ' + eur(e0.amount) : '';
  const q = e0 && e0.kind === 'income' ? 'confirm.delIncome' : 'confirm.delExpense';
  if (!(await ask(I18N.t(q) + line, { ok: 'dlg.delete', danger: true }))) return;
  if (!unlocked()) return;
  try {
    const removed = await apiFetch('DELETE', `/api/expenses/${id}`);
    loadDashboard();
    showToast(I18N.t('toast.deleted'), false, { action: { label: I18N.t('toast.undo'), fn: () => undoDeleteExpense(removed) }, ms: UNDO_MS });
  } catch (e) {
    showToast(tErr(e), true);
  }
}
async function undoDeleteExpense(removed) {
  if (!unlocked() || !removed) return;
  try {
    await apiFetch('POST', '/api/expenses/restore', removed);
    loadDashboard();
    showToast(I18N.t(removed.entry && removed.entry.kind === 'income' ? 'toast.restoredInc' : 'toast.restored'));
  } catch (e) {
    showToast(tErr(e), true);
  }
}

// --- FIXED COST MODAL ---
function selectPeriod(p) {
  selectedPeriod = p;
  document.querySelectorAll('.period-pill[data-period]').forEach(el => {   // nur Intervall-Knöpfe, nicht die Art-Knöpfe (v1.12)
    el.classList.toggle('active', el.dataset.period === p);
  });
}

function openFixedModal(id) {
  editingFixedId = id || null;
  const isEdit = !!id;
  $('fixed-modal-title').textContent = I18N.t(isEdit ? 'modal.fixedEdit' : 'modal.fixedAdd');
  $('fc-name').value = '';
  $('fc-amount').value = '';
  $('fc-since').value = todayISO();
  $('fc-note').value = '';
  $('fc-usage').value = 'privat'; syncCombo('fc-usage');
  $('fc-active-group').style.display = isEdit ? 'block' : 'none';
  $('fc-active').checked = true;
  selectPeriod('monthly');
  if (isEdit) loadFixedForEdit(id);
  openModal('modal-fixed', 'fc-name');
}

async function loadFixedForEdit(id) {
  try {
    const list = await apiFetch('GET', '/api/fixed-costs');
    const fc = list.find(f => f.id === id);
    if (!fc || !unlocked()) return;
    $('fc-name').value = fc.name;
    $('fc-amount').value = fc.amount;
    $('fc-since').value = fc.since || '';   // leer = „gilt für alle Monate" — bleibt beim Speichern leer
    $('fc-note').value = fc.note || '';
    $('fc-usage').value = fc.usage || 'privat'; syncCombo('fc-usage');
    $('fc-active').checked = fc.active;
    selectPeriod(fc.period || 'monthly');
    selectValue($('fc-category'), fc.category);
  } catch (e) { /* ignore */ }
}

function closeFixedModal() {
  closeModal('modal-fixed');
  editingFixedId = null;
}

async function saveFixed() {
  const name = $('fc-name').value.trim();
  const amount = parseFloat($('fc-amount').value);
  if (!name || !amount || amount <= 0) { showToast(I18N.t('toast.reqFields'), true); return; }

  const body = {
    name,
    amount,
    period: selectedPeriod,
    category: $('fc-category').value,
    // leeres Feld = null = „gilt für alle Monate"; NICHT heute (Audit run-1 #2: löschte die Historie)
    since: $('fc-since').value || null,
    note: $('fc-note').value.trim(),
    usage: $('fc-usage').value
  };
  if (editingFixedId) body.active = $('fc-active').checked;

  const btn = $('btn-fc-save');
  btn.disabled = true;
  try {
    if (editingFixedId) {
      await apiFetch('PATCH', `/api/fixed-costs/${editingFixedId}`, body);
      showToast(I18N.t('toast.fcUpdated'));
    } else {
      await apiFetch('POST', '/api/fixed-costs', body);
      showToast(I18N.t('toast.fcAdded'));
    }
    closeFixedModal();
    loadFixedCosts();
    loadDashboard();
  } catch (e) {
    showToast(tErr(e), true);
  } finally {
    btn.disabled = false;
  }
}

async function toggleFixed(id, active) {
  try {
    await apiFetch('PATCH', `/api/fixed-costs/${id}`, { active });
    showToast(active ? I18N.t('toast.activated') : I18N.t('toast.deactivated'));
    loadFixedCosts();
    loadDashboard();
  } catch (e) {
    showToast(tErr(e), true);
  }
}

async function deleteFixed(id) {
  if (!(await ask(I18N.t('confirm.delFixed'), { ok: 'dlg.deleteForever', danger: true }))) return;
  if (!unlocked()) return;
  try {
    await apiFetch('DELETE', `/api/fixed-costs/${id}`);
    showToast(I18N.t('toast.deleted'));
    loadFixedCosts();
    loadDashboard();
  } catch (e) {
    showToast(tErr(e), true);
  }
}

// --- VERBINDLICHKEITEN (v1.6) ---
async function loadLiabilities() {
  try {
    const list = await apiFetch('GET', '/api/liabilities');
    if (!unlocked()) return;
    renderLiabilities(list);
  } catch (e) {
    showError(tErr(e));
  }
}

function renderLiabilities(list) {
  const open = list.filter(l => !l.done);
  const done = list.filter(l => l.done);
  const td = todayISO();
  const overdue = open.filter(l => l.due && l.due < td);

  const openTotal = open.reduce((s, l) => s + Number(l.amount || 0), 0);
  const totalEl = $('liab-open-total');
  totalEl.textContent = eur(openTotal);
  totalEl.classList.toggle('warn', overdue.length > 0);
  $('liab-open-count').textContent = String(open.length);
  $('liab-count-sub').textContent = I18N.t('liab.countSub', { open: open.length, overdue: overdue.length });

  function dueBadge(l) {
    if (!l.due) return '';
    if (l.due < td) return `<span class="due-badge overdue">${escapeHtml(I18N.t('liab.overdue'))} · ${formatDateDE(l.due)}</span>`;
    if (l.due === td) return `<span class="due-badge soon">${escapeHtml(I18N.t('liab.dueToday'))}</span>`;
    // innerhalb der nächsten 7 Tage: orange
    const days = Math.round((new Date(l.due + 'T00:00:00') - new Date(td + 'T00:00:00')) / 86400000);
    return `<span class="due-badge ${days <= 7 ? 'soon' : ''}">${escapeHtml(I18N.t('liab.dueOn', { date: formatDateDE(l.due) }))}</span>`;
  }

  function renderItem(l) {
    const id = escapeHtml(l.id);
    const isOverdue = !l.done && l.due && l.due < td;
    return `
      <div class="fixed-item liab-item ${l.done ? 'done' : ''} ${isOverdue ? 'overdue' : ''}">
        <button class="liab-check ${l.done ? 'checked' : ''}" data-action="toggleLiab" data-id="${id}" data-arg="${l.done ? '0' : '1'}"
                title="${escapeHtml(I18N.t(l.done ? 'liab.reopen' : 'liab.markDone'))}" aria-label="${escapeHtml(I18N.t(l.done ? 'liab.reopen' : 'liab.markDone'))}">${l.done ? ICON.svg('check') : ''}</button>
        <div class="item-left">
          <div class="item-name">${escapeHtml(l.name)}</div>
          <div class="item-meta">
            ${l.done
              ? (l.doneAt ? `<span class="item-date">${escapeHtml(I18N.t('liab.doneOn', { date: formatDateDE(l.doneAt) }))}</span>` : '')
              : dueBadge(l)}
          </div>
          ${l.note ? `<div class="item-subnote">${escapeHtml(l.note)}</div>` : ''}
        </div>
        <div class="item-right">
          <div class="item-amount">${eur(l.amount)}</div>
          <div class="item-actions">
            ${l.done
              ? `<button class="action-btn success" data-action="toggleLiab" data-id="${id}" data-arg="0" title="${escapeHtml(I18N.t('liab.reopen'))}" aria-label="${escapeHtml(I18N.t('liab.reopen'))}">${ICON.svg('undo')}</button>
                 <button class="action-btn danger" data-action="deleteLiab" data-id="${id}" title="${escapeHtml(I18N.t('confirm.delLiab'))}" aria-label="${escapeHtml(I18N.t('confirm.delLiab'))}">${ICON.svg('trash')}</button>`
              : `<button class="action-btn" data-action="bookLiab" data-id="${id}" title="${escapeHtml(I18N.t('liab.book'))}" aria-label="${escapeHtml(I18N.t('liab.book'))}">${ICON.svg('coins')}</button>
                 <button class="action-btn" data-action="openLiab" data-id="${id}" title="${escapeHtml(I18N.t('modal.liabEdit'))}" aria-label="${escapeHtml(I18N.t('modal.liabEdit'))}">${ICON.svg('edit')}</button>
                 <button class="action-btn danger" data-action="deleteLiab" data-id="${id}" title="${escapeHtml(I18N.t('confirm.delLiab'))}" aria-label="${escapeHtml(I18N.t('confirm.delLiab'))}">${ICON.svg('trash')}</button>`
            }
          </div>
        </div>
      </div>`;
  }

  let html = '';
  if (open.length === 0 && done.length === 0) {
    html = `<div class="empty-state">${ICON.svg('clipboard', 'lg')}<div>${I18N.t('liab.empty')}</div></div>`;
  } else {
    if (open.length > 0) html += `<div class="item-list">${open.map(renderItem).join('')}</div>`;
    else html += `<div class="empty-state" style="padding:20px 16px">${I18N.t('liab.empty')}</div>`;
    if (done.length > 0) {
      html += `<div class="inactive-section-title">${I18N.t('liab.doneSection')}</div>`;
      html += `<div class="item-list">${done.map(renderItem).join('')}</div>`;
    }
  }
  $('liab-content').innerHTML = html;
}

function openLiabModal(id) {
  editingLiabId = id || null;
  const isEdit = !!id;
  $('liab-modal-title').textContent = I18N.t(isEdit ? 'modal.liabEdit' : 'modal.liabAdd');
  $('liab-name').value = '';
  $('liab-amount').value = '';
  $('liab-due').value = '';
  $('liab-note').value = '';
  if (isEdit) loadLiabForEdit(id);
  openModal('modal-liab', 'liab-name');
}

async function loadLiabForEdit(id) {
  try {
    const list = await apiFetch('GET', '/api/liabilities');
    const l = list.find(x => x.id === id);
    if (!l || !unlocked()) return;
    $('liab-name').value = l.name;
    $('liab-amount').value = l.amount;
    $('liab-due').value = l.due || '';
    $('liab-note').value = l.note || '';
  } catch (e) { /* ignore */ }
}

function closeLiabModal() {
  closeModal('modal-liab');
  editingLiabId = null;
}

async function saveLiab() {
  const name = $('liab-name').value.trim();
  const amount = Number($('liab-amount').value);
  if (!name || !isFinite(amount) || amount <= 0) { showToast(I18N.t('toast.reqFields'), true); return; }
  const body = {
    name, amount,
    due: $('liab-due').value || null,
    note: $('liab-note').value.trim()
  };
  const btn = $('btn-liab-save');
  btn.disabled = true;
  try {
    if (editingLiabId) {
      await apiFetch('PATCH', `/api/liabilities/${editingLiabId}`, body);
      showToast(I18N.t('toast.liabUpdated'));
    } else {
      await apiFetch('POST', '/api/liabilities', body);
      showToast(I18N.t('toast.liabAdded'));
    }
    closeLiabModal();
    loadLiabilities();
  } catch (e) {
    showToast(tErr(e), true);
  } finally {
    btn.disabled = false;
  }
}

async function toggleLiab(id, done) {
  try {
    await apiFetch('PATCH', `/api/liabilities/${id}`, { done: done === true });
    showToast(I18N.t(done ? 'toast.liabDone' : 'toast.liabReopened'));
    loadLiabilities();
  } catch (e) {
    showToast(tErr(e), true);
  }
}

// "Abhaken + als Ausgabe buchen": öffnet das normale Ausgaben-Modal vorbefüllt
// (Kategorie frei wählbar); nach dem Speichern wird die Verbindlichkeit abgehakt.
async function bookLiab(id) {
  try {
    const list = await apiFetch('GET', '/api/liabilities');
    const l = list.find(x => x.id === id);
    if (!l || !unlocked()) return;
    openExpenseModal();
    pendingLiabId = l.id;
    $('exp-kind-group').style.display = 'none';   // gebuchte Verbindlichkeit = immer Ausgabe (saveExpense erzwingt es zusätzlich)
    setExpTitle('modal.bookExpense');
    $('exp-name').value = l.name;
    $('exp-amount').value = l.amount;
    $('exp-note').value = l.note || I18N.t('liab.bookNote');
  } catch (e) {
    showToast(tErr(e), true);
  }
}

async function deleteLiab(id) {
  if (!(await ask(I18N.t('confirm.delLiab'), { ok: 'dlg.deleteForever', danger: true }))) return;
  if (!unlocked()) return;
  try {
    await apiFetch('DELETE', `/api/liabilities/${id}`);
    showToast(I18N.t('toast.deleted'));
    loadLiabilities();
  } catch (e) {
    showToast(tErr(e), true);
  }
}

// --- EXPORT ---
// Datei speichern: nativ (Capacitor) per Filesystem+Share, im Web per Blob-Download.
const CAP = window.Capacitor || null;
const isNative = !!(CAP && CAP.isNativePlatform && CAP.isNativePlatform());

async function saveFile(name, content, mime) {
  mime = mime || 'application/octet-stream';
  if (isNative) {
    const FS = CAP.Plugins && CAP.Plugins.Filesystem;
    if (!FS) throw new Error('err.filesystem');
    const w = await FS.writeFile({ path: name, data: content, directory: 'DOCUMENTS', encoding: 'utf8', recursive: true });
    try { const SH = CAP.Plugins && CAP.Plugins.Share; if (SH) await SH.share({ title: name, url: w.uri }); } catch (_) {}
    return;
  }
  const blob = new Blob([content], { type: mime + ';charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function downloadCSV() {
  const year = $('export-year').value;
  const month = $('export-month').value;
  try {
    const { filename, content } = window.LocalDB.csvExport(year, month);
    await saveFile(filename, content, 'text/csv');
    showToast(I18N.t('toast.csv'));
  } catch (e) { showToast(tErr(e), true); }
}

async function downloadFixedSummary() {
  const year = $('export-year').value;
  const month = $('export-month').value;
  try {
    const { filename, content } = window.LocalDB.csvFixedSummary(year, month);
    await saveFile(filename, content, 'text/csv');
    showToast(I18N.t('toast.fixedSummary'));
  } catch (e) { showToast(tErr(e), true); }
}

// --- Backup / Restore (.vault) ---
async function exportBackup() {
  try {
    const raw = window.LocalDB.exportVaultRaw();
    if (!raw) { showToast(I18N.t('toast.noVault'), true); return; }
    const d = todayISO();   // Ortsdatum, nicht UTC (R3 H3: am 01.12. 00:30 Berlin hieß die Datei sonst …-11-30)
    await saveFile(`ausgaben-tracker-${d}.vault`, raw, 'application/octet-stream');
    showToast(I18N.t('toast.backupExported'));
  } catch (e) { showToast(tErr(e), true); }
}

// Backup wiederherstellen: Datei lesen → Struktur prüfen → Passwort des Backups abfragen → erst wenn
// das Backup entschlüsselt ist, wird der gespeicherte Tresor ersetzt (Audit run-1 #1). Auch vom
// Sperrbildschirm aus möglich; eine unbrauchbare Datei kann die vorhandenen Daten nicht zerstören.
const RESTORE_MAX_BYTES = 8 * 1024 * 1024;
let pendingRestore = null;
// Nachgeholter Import (v1.11, Port aus Sachwert-Tresor v3.6/v3.6.1, Nutzer 26.09.2026): der Datei-Picker ist eine fremde Android-Activity, und die
// Sperre läuft währenddessen weiter (Wegzeit-Prüfung in visibilitychange, Inaktivitäts-Timer). Sperrte die App, während der Picker offen war,
// räumte lockApp() die Datei weg (Modal zu, pendingRestore=null) — still verworfen. Jetzt: nur den Dateiverweis merken (Handle, kein Inhalt —
// gelesen wird erst nach dem Entsperren), Toast auf dem Sperrbildschirm, nach doUnlock() Backup-Tab + derselbe Handler mit derselben Datei.
// Die Frist PENDING_FILE_MS läuft ab dem Zurückstellen, also ab der Sperre (Audit v1.11 b1: ab der Dateiwahl gerechnet war ein Verweis aus
// einem offenen Modal bei Auto-Lock ≥ 5 min schon beim Sperren verfallen). Zurückgestellte Uhr = verfallen, der Verweis wird IMMER verbraucht,
// verfallen meldet ein Toast. Sperr-Regel unverändert (keine Schonfrist). Im gesperrten Zustand wird nie fertig gelesen: lockApp() bricht eine
// laufende Lesung ab, autoLock() stellt sie zurück (Audit a2).
// Anders als im Tresor ist Wiederherstellen auch VOM Sperrbildschirm aus erlaubt: zurückgestellt wird nur, wenn der Picker in einer entsperrten
// Sitzung geöffnet wurde (pickSession) — eine Wahl vom Sperrbildschirm läuft wie bisher direkt ins Passwort-Modal und ersetzt einen
// zurückgestellten Verweis erst, wenn wirklich eine Datei kommt (Abbruch im Picker lässt ihn stehen, Audit b2).
let pendingFile = null, pickSession = false, restoreSrc = null, curRead = null, pendingTimer = null;
const PENDING_FILE_MS = 5 * 60000;
function pickRestore() { pickSession = unlocked(); $('restore-file').click(); }
function deferFile(file) {
  const p = pendingFile = { file, at: Date.now() };
  clearTimeout(pendingTimer); pendingTimer = setTimeout(() => { p.file = null; }, PENDING_FILE_MS + 60000);   // Puffer > Entsperrdauer (PBKDF2), Frist prüft runPendingFile   // Handle nicht unbefristet im Speicher (a6); at bleibt für die Verfallsmeldung
  showToast(I18N.t('toast.importDeferred'), false, { ms: 8000 });
}
// t0 = Zeitpunkt des Entsperr-Klicks: die Frist zählt bis dahin, nicht bis nach der Schlüsselableitung (Audit R2 #1)
function runPendingFile(t0) {
  const p = pendingFile; pendingFile = null; clearTimeout(pendingTimer);
  if (!p || !unlocked()) return;
  hideToast();   // „zum Wiederherstellen entsperren“ ist jetzt erledigt bzw. falsch (a5/b3)
  const d = (t0 || Date.now()) - p.at;
  if (d < 0 || Date.now() < p.at || d > PENDING_FILE_MS || !p.file) { showToast(I18N.t('toast.importExpired'), true, { ms: 6000 }); return; }
  showTab('export'); pickSession = true;
  restoreBackup({ target: { files: [p.file], value: '' } });
}
function restoreBackup(event) {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;
  const fromSession = pickSession;
  if (file.size > RESTORE_MAX_BYTES) { showToast(I18N.t('err.tooLarge'), true); return; }   // Metadatum, vor dem Zurückstellen (Audit c3: sonst falsche Zusage)
  if (fromSession && !unlocked()) { deferFile(file); return; }   // gesperrt, während der Picker offen war: nur den Verweis merken
  const reader = new FileReader(), me = curRead = { reader, file, fromSession };
  const done = () => { const cur = curRead === me; if (cur) curRead = null; return cur; };   // false: abgebrochen oder von einer neueren Wahl abgelöst
  // Geänderte/ersetzte Datei (z. B. Syncthing) liest Chromium nicht (NotReadableError) — ohne onerror blieb es still (Tresor-Audit run-6 #2)
  reader.onerror = () => { if (done()) showToast(I18N.t('err.readFile'), true); };
  reader.onload = () => {
    if (!done()) return;
    if (fromSession && !unlocked()) { deferFile(file); return; }   // Absicherung; lockApp() bricht laufende Lesungen ohnehin ab
    try {
      const content = String(reader.result);
      window.LocalDB.checkBackup(content);
      if (!fromSession) { pendingFile = null; clearTimeout(pendingTimer); }   // gültige neue Wahl vom Sperrbildschirm ersetzt einen zurückgestellten Verweis (R2 #2: erst nach checkBackup)
      pendingRestore = content; restoreSrc = fromSession ? file : null;
      $('restore-file-name').textContent = I18N.t('restore.file', { name: file.name });
      $('restore-pass').value = ''; $('restore-err').textContent = '';
      openModal('modal-restore', 'restore-pass');
    } catch (e) { showToast(tErr(e), true); }
  };
  reader.readAsText(file);
}
function closeRestore() { pendingRestore = null; restoreSrc = null; $('restore-pass').value = ''; closeModal('modal-restore'); }
async function saveRestore() {
  if (!pendingRestore) return;
  const btn = $('btn-restore'); const errEl = $('restore-err');
  errEl.textContent = ''; btn.disabled = true;
  try {
    await window.LocalDB.restoreVault(pendingRestore, $('restore-pass').value);
    pendingRestore = null; restoreSrc = null; pendingFile = null;   // ein älterer zurückgestellter Verweis gehört nicht zu den neuen Daten
    $('restore-pass').value = '';
    closeModal('modal-restore');
    clearIdle();
    clearRendered();
    enterApp();
    showToast(I18N.t('toast.backupRestored'));
  } catch (e) { errEl.textContent = tErr(e); }
  finally { btn.disabled = false; }
}
$('restore-pass').addEventListener('keydown', e => { if (e.key === 'Enter') saveRestore(); });

// --- EINSTELLUNGEN ---
function renderSettings() {
  $('set-autolock').value = String(settings.autolock); syncCombo('set-autolock');
  updateThemeSeg();
  $('about-line').textContent = I18N.t('about', { v: APP_VERSION });
  renderCategoryList();
}

async function setAutolock(value) {
  try {
    settings = await apiFetch('PUT', '/api/settings', { autolock: Number(value) });
    resetIdle();
    showToast(I18N.t('toast.settingsSaved'));
  } catch (e) { showToast(tErr(e), true); renderSettings(); }
}

// Theme: LS-Key 'alien-theme' ist markenweit geteilt (Sachwert-Tresor, Alien Pass)
function theme(t) {
  try {
    if (t === 'soft') { document.documentElement.setAttribute('data-theme', 'soft'); localStorage.setItem('alien-theme', 'soft'); }
    else { document.documentElement.removeAttribute('data-theme'); localStorage.setItem('alien-theme', 'dark'); }
  } catch (_) {}
  updateThemeSeg();
}
function updateThemeSeg() {
  const soft = document.documentElement.getAttribute('data-theme') === 'soft';
  $('th-dark').classList.toggle('on', !soft);
  $('th-soft').classList.toggle('on', soft);
}

// Master-Passwort ändern (Karte in den Einstellungen)
async function saveChangePass() {
  const oldPw = $('pass-old').value;
  const n1 = $('pass-new1').value;
  const n2 = $('pass-new2').value;
  if (n1 !== n2) { showToast(I18N.t('toast.passMismatch'), true); return; }
  const btn = $('btn-pass-save');
  btn.disabled = true;
  try {
    await window.LocalDB.changePassword(oldPw, n1);
    ['pass-old', 'pass-new1', 'pass-new2'].forEach(id => { $(id).value = ''; });
    showToast(I18N.t('toast.passChanged'));
  } catch (e) { showToast(tErr(e), true); }
  finally { btn.disabled = false; }
}

// Kategorien verwalten: Liste mit Zähler, Umbenennen inline, Löschen mit Rückfrage
let catCounts = new Map();
async function renderCategoryList() {
  try {
    const [ex, fc] = await Promise.all([apiFetch('GET', '/api/expenses'), apiFetch('GET', '/api/fixed-costs')]);
    // Zählen je Art (v1.12): ein Eintrag mit verwaistem Namen der anderen Art zählt nicht mit — wie retag() in der Route (Review N2)
    catCounts = new Map();
    const bump = (kind, name) => { const k = kind + '\u0000' + name; catCounts.set(k, (catCounts.get(k) || 0) + 1); };
    ex.forEach(e => bump(e.kind === 'income' ? 'income' : 'expense', e.category));
    fc.forEach(f => bump('expense', f.category));
  } catch (e) { catCounts = new Map(); }
  if (!unlocked()) return;
  const cnt = c => catCounts.get((c.kind === 'income' ? 'income' : 'expense') + '\u0000' + c.name) || 0;
  const row = c => `
    <div class="cat-row" data-cat-id="${escapeHtml(c.id)}">
      <span class="cat-name">${escapeHtml(c.name)}</span>
      <span class="cat-count">${cnt(c) === 1 ? I18N.t('set.catCount1') : I18N.t('set.catCount', { n: cnt(c) })}</span>
      <button class="action-btn" data-action="catEdit" data-id="${escapeHtml(c.id)}" title="${escapeHtml(I18N.t('set.catRename'))}" aria-label="${escapeHtml(I18N.t('set.catRename'))}">${ICON.svg('edit')}</button>
      <button class="action-btn danger" data-action="catDelete" data-id="${escapeHtml(c.id)}" title="${escapeHtml(I18N.t('set.catDelete'))}" aria-label="${escapeHtml(I18N.t('set.catDelete'))}">${ICON.svg('trash')}</button>
    </div>`;
  $('cat-list').innerHTML = catsOf('expense').map(row).join('');
  $('cat-list-inc').innerHTML = catsOf('income').map(row).join('');   // Einnahme-Kategorien (v1.12)
}
async function afterCategoryChange(toastKey, vars) {
  await loadCategories();
  await renderCategoryList();
  if (dashData) loadDashboard();
  showToast(I18N.t(toastKey, vars));
}
async function addCategory(kind) {
  kind = kind === 'income' ? 'income' : 'expense';
  const inp = $(kind === 'income' ? 'cat-new-inc' : 'cat-new');
  const name = inp.value.trim();
  if (!name) return;
  try {
    await apiFetch('POST', '/api/categories', { name, kind });
    inp.value = '';
    await afterCategoryChange('toast.catAdded');
  } catch (e) { showToast(tErr(e), true); }
}
function catEdit(id) {
  const row = document.querySelector(`.cat-row[data-cat-id="${CSS.escape(id)}"]`);
  const c = categories.find(x => x.id === id);
  if (!row || !c) return;
  row.innerHTML = `
    <input type="text" id="cat-edit-input" maxlength="60" value="${escapeHtml(c.name)}" autocomplete="off">
    <button class="btn sm" data-action="catSave" data-id="${escapeHtml(c.id)}">${escapeHtml(I18N.t('set.catOk'))}</button>
    <button class="btn ghost sm" data-action="catCancel">${escapeHtml(I18N.t('set.catCancel'))}</button>`;
  const inp = row.querySelector('input');
  inp.focus(); inp.select();
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') catSave(id); if (e.key === 'Escape') renderCategoryList(); });
}
// Feld aus der EIGENEN Zeile lesen: zwei offene Bearbeitungszeilen (zwei Listen seit v1.12) trugen dieselbe id, $() traf die erste (Review v1.12 N7)
async function catSave(id) {
  const row = document.querySelector(`.cat-row[data-cat-id="${CSS.escape(id)}"]`);
  const inp = row ? row.querySelector('input') : null;
  const name = inp ? inp.value.trim() : '';
  if (!name) return;
  try {
    await apiFetch('PUT', `/api/categories/${id}`, { name });
    await afterCategoryChange('toast.catRenamed');
  } catch (e) { showToast(tErr(e), true); }
}
async function catDelete(id) {
  const c = categories.find(x => x.id === id);
  if (!c) return;
  try {
    // Zielkategorie kommt aus derselben Logik wie die Route — Dialog und Ergebnis stimmen überein (Audit run-1 #9)
    const { target } = await apiFetch('GET', `/api/categories/delete-target?id=${encodeURIComponent(id)}`);
    if (!(await ask(I18N.t('confirm.delCat', { name: c.name, fb: target }), { ok: 'dlg.deleteCat', danger: true }))) return;
    if (!unlocked() || !categories.some(x => x.id === id)) return;   // Sperre oder Kategorie inzwischen weg
    const res = await apiFetch('DELETE', `/api/categories/${id}`);
    await afterCategoryChange('toast.catDeletedTo', { target: res.target });
  } catch (e) { showToast(tErr(e), true); }
}

// --- HANDBUCH ---
function openHelp() {
  lastFocus = document.activeElement;
  $('help-about').textContent = I18N.t('about', { v: APP_VERSION });
  $('help-overlay').classList.remove('hidden');
  $('help-overlay').scrollTop = 0;
}
function closeHelp() {
  $('help-overlay').classList.add('hidden');
  if (lastFocus && document.body.contains(lastFocus) && typeof lastFocus.focus === 'function') lastFocus.focus();
  lastFocus = null;
}

// --- TOAST / ERROR ---
// Toast mit optionalem Knopf (v1.9, Kit-Baustein): showToast(msg, isError, {action:{label,fn}, ms}). Ohne Aktion trägt der Knopf
// keinen Text (Suiten lesen #toast per textContent). hideToast() räumt Text und Aktion — auch beim Sperren (clearRendered), damit kein
// „Rückgängig“ in eine gesperrte App hinein wirkt; toastAction prüft zusätzlich unlocked(). Tests leeren #toast nie per textContent, sondern hideToast().
const UNDO_MS = 6000;   // so lange steht „Rückgängig“ nach dem Löschen im Toast
let toastFn = null, toastTimer = null;
function showToast(msg, isError, opt) {
  const t = $('toast'); opt = opt || {};
  $('toast-msg').textContent = msg;
  const b = $('toast-btn'); toastFn = opt.action ? opt.action.fn : null;
  b.textContent = opt.action ? opt.action.label : ''; b.classList.toggle('hidden', !opt.action);
  t.className = 'toast ' + (isError ? 'err' : 'ok') + ' show';
  clearTimeout(toastTimer); toastTimer = setTimeout(hideToast, opt.ms || 2800);
}
function hideToast() {
  clearTimeout(toastTimer); toastTimer = null;
  $('toast').classList.remove('show'); $('toast-msg').textContent = '';
  $('toast-btn').textContent = ''; $('toast-btn').classList.add('hidden'); toastFn = null;
}
function toastAction() { const fn = toastFn; hideToast(); if (typeof fn === 'function' && unlocked()) fn(); }

// Rückfrage als eigener DOM-Dialog (v1.9, Vorlage Alien Pass v1.9 / Sachwert-Tresor v3.5) statt confirm(): der Android-Systemdialog erbt
// FLAG_SECURE nicht — ein Screenshot bei offener Löschnachfrage zeigte den Dialogtext, während die App dahinter schwarz war (Querfund Alien Notes).
// ask(msg,{ok,danger}) liefert ein Promise<boolean>; nur ein Dialog zur Zeit (eine zweite Frage gilt sofort als abgelehnt); Escape/Hintergrund
// = Abbrechen; Tab pendelt zwischen den Knöpfen; clearRendered() schließt ihn beim Sperren mit false, und JEDER Aufrufer prüft nach dem await
// seinen Zustand neu (unlocked()? Eintrag noch da?). Text nur per textContent (pre-line macht Absätze aus \n\n). Kein Eingabefeld nötig.
let dlgResolve = null, dlgPrev = null;
function ask(msg, opt) {
  opt = opt || {}; if (dlgResolve) return Promise.resolve(false);
  return new Promise(res => {
    dlgResolve = res; dlgPrev = document.activeElement; $('dlg-msg').textContent = msg;
    const b = $('dlg-ok'); b.textContent = I18N.t(opt.ok || 'dlg.ok'); b.classList.toggle('danger', !!opt.danger);
    $('dlg').classList.remove('hidden'); $('dlg-cancel').focus();
  });
}
function dialogClose(v) {
  const r = dlgResolve; if (!r) return; dlgResolve = null;
  $('dlg').classList.add('hidden'); $('dlg-msg').textContent = ''; $('dlg-ok').classList.remove('danger');
  const f = dlgPrev; dlgPrev = null;
  if (f && document.contains(f) && typeof f.focus === 'function') { try { f.focus(); } catch (_) { /* Element nicht mehr fokussierbar */ } }
  r(!!v);
}
function dialogOk() { dialogClose(true); }
function dialogCancel() { dialogClose(false); }
function dialogOpen() { return !!dlgResolve; }
function dialogKey(ev) {
  if (!dlgResolve) return false;
  if (ev.key === 'Escape') { dialogCancel(); return true; }
  if (ev.key === 'Tab') {
    const ring = [$('dlg-cancel'), $('dlg-ok')]; const i = ring.indexOf(document.activeElement);
    ring[(i + (ev.shiftKey ? -1 : 1) + ring.length) % ring.length].focus(); return true;
  }
  return false;
}

function showError(msg) {
  const el = $('error');
  el.textContent = I18N.t('err.prefix') + msg;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 5000);
}

// LocalDB wirft i18n-Schlüssel (err.*) — hier in die aktive Sprache übersetzen
function tErr(e) {
  const m = (e && e.message) || String(e || '');
  if (/^[a-z]+\.[A-Za-z]+$/.test(m) && I18N.has(m)) return I18N.t(m);
  if (e && e.name === 'QuotaExceededError') return I18N.t('err.tooLarge');
  if (e && (e instanceof DOMException)) return I18N.t('err.corrupt');   // atob/WebCrypto-Fehler nie roh anzeigen
  return m || I18N.t('err.unknown');
}

// --- INIT (läuft erst nach Entsperren) ---
let appReady = false;
// „Heute“ neu setzen; stand die Übersicht auf dem bisher laufenden Monat (bzw. das Jahr auf dem laufenden Jahr), rückt sie mit — ein bewusst
// gewählter anderer Monat bleibt stehen (R2 M-1). Verglichen wird mit dem zuletzt GESEHENEN Tag als Zahlen (seen*), nicht mit dem alten
// Date-Objekt: nach einem Zeitzonenwechsel läse das alte Objekt schon die neue Zone, der Monatswechsel bliebe unbemerkt (R3 N1).
// Liegt die Ansicht nach einem Zurückstellen der Uhr in der Zukunft, fällt sie auf heute zurück (R3 H4). Gerendert werden nur
// datumsabhängige Ansichten (Übersicht, Jahr, Schulden) — nie Einstellungen/Fixkosten, dort ginge ein angefangenes Umbenennen verloren (R3 N4).
// Liefert true, wenn sich die angezeigte Position (Monat/Jahr) geändert hat.
let seenY = today.getFullYear(), seenM = today.getMonth() + 1, seenD = today.getDate();
function followToday(rerender) {
  const py = seenY, pm = seenM, pd = seenD;
  today = new Date();
  const y = today.getFullYear(), m = today.getMonth() + 1, d = today.getDate();
  seenY = y; seenM = m; seenD = d;
  let moved = false;
  if (y !== py || m !== pm) {
    if (dashYear === py && dashMonth === pm) { dashYear = y; dashMonth = m; moved = true; }
    if (annualYear === py && y !== py) { annualYear = y; moved = true; }
    if (y !== py) populateExportYears();
  }
  if (ymNum(dashYear, dashMonth) > ymNum(y, m)) { dashYear = y; dashMonth = m; moved = true; }
  if (annualYear > y) { annualYear = y; moved = true; }
  if (rerender && (moved || y !== py || m !== pm || d !== pd)) renderDated();   // auch Tageswechsel: „heute fällig“ (R3 H2)
  return moved;
}
function renderDated() {
  if (!unlocked()) return;
  updateMonthLabel();
  $('btn-next-year').disabled = annualYear >= today.getFullYear();
  const a = document.querySelector('.nav-tab.active'), v = a ? a.dataset.tab : 'dashboard';
  if (v === 'dashboard') loadDashboard(); else if (v === 'annual') loadAnnual(); else if (v === 'liab') loadLiabilities();
}
// Vordergrund über Mitternacht (kein visibilitychange, Auto-Sperre aus): einmal pro Minute nachsehen (R3 N3). Rendert nur bei Tageswechsel.
setInterval(() => { if (unlocked() && !document.hidden) followToday(true); }, 60000);

async function init() {
  followToday(false);   // Entsperren nach einem Monatswechsel: laufender Monat statt des alten (init lädt danach ohnehin neu)
  await loadSettings();
  resetIdle();   // Timer erst mit dem echten Wert scharfschalten (Audit run-1 #8: vorher 5-Min-Default)
  await loadCategories();
  updateMonthLabel();
  loadDashboard();
  appReady = true;
}

// --- AUTH-FLOW ---
function showAuth() {
  document.body.classList.add('locked');
  const setup = !window.LocalDB.hasVault();
  $('auth-setup').classList.toggle('active', setup);
  $('auth-unlock').classList.toggle('active', !setup);
  const focusEl = $(setup ? 'setup-pass1' : 'unlock-pass');
  // Nie aus einem inzwischen geöffneten Modal (Backup-Passwort) wegspringen: Getipptes landete sonst im Feld dahinter (v1.12, gefunden als
  // sporadisch rote verify-audit1: Restore-Passwort leer, Setup-Feld voll)
  setTimeout(() => { if (focusEl && !document.querySelector('.modal-overlay.open')) focusEl.focus(); }, 100);
}

function enterApp() {
  $('auth-setup').classList.remove('active');
  $('auth-unlock').classList.remove('active');
  document.body.classList.remove('locked');
  if (!appReady) init();
  resetIdle();
}

async function doSetup() {
  const p1 = $('setup-pass1').value;
  const p2 = $('setup-pass2').value;
  const errEl = $('setup-err');
  errEl.textContent = '';
  if (p1.length < 8) { errEl.textContent = I18N.t('err.shortPass'); return; }
  if (p1 !== p2) { errEl.textContent = I18N.t('toast.passMismatch'); return; }
  const btn = $('setup-btn');
  btn.disabled = true;
  try {
    await window.LocalDB.setup(p1);
    pendingFile = null;   // ein Verweis gehört zum alten Tresor, nie zu einem neu eingerichteten (Tresor-Audit run-6 #5)
    $('setup-pass1').value = '';
    $('setup-pass2').value = '';
    enterApp();
    showToast(I18N.t('toast.vaultCreated'));
  } catch (e) { errEl.textContent = tErr(e); }
  finally { btn.disabled = false; }
}

async function doUnlock() {
  const errEl = $('unlock-err');
  errEl.textContent = '';
  const btn = $('unlock-btn');
  btn.disabled = true; btn.textContent = I18N.t('auth.unlocking');
  const t0 = Date.now();   // Klickzeit für die Frist des zurückgestellten Imports (Ableitung dauert am Handy Sekunden)
  try {
    await window.LocalDB.unlock($('unlock-pass').value);
    $('unlock-pass').value = '';
    enterApp();
    runPendingFile(t0);   // Import, der beim Sperren zurückgestellt wurde, läuft jetzt weiter (v1.11)
  } catch (e) {
    errEl.textContent = tErr(e);
    maskPasswordFields();   // Fehlversuch: Auge zu (Sperr-Hygiene)
  } finally { btn.disabled = false; btn.textContent = I18N.t('auth.unlockBtn'); }
}

// Nach dem Sperren darf nichts Entschlüsseltes im (verdeckten) DOM lesbar bleiben
function clearRendered() {
  ['dashboard-content', 'dash-cats', 'dash-chips', 'summary-cards', 'dash-balance', 'annual-content', 'annual-balance', 'fixed-content', 'liab-content',
   'exp-category', 'fc-category', 'cat-list', 'cat-list-inc'].forEach(id => {
    const el = $(id); if (el) el.innerHTML = '';
  });
  ['fc-monthly-total', 'fc-yearly-total', 'month-label', 'liab-open-total', 'liab-open-count', 'liab-count-sub', 'about-line', 'help-about'].forEach(id => {
    const el = $(id); if (el) el.textContent = '';
  });
  ['exp-name', 'exp-amount', 'exp-note', 'exp-date', 'fc-name', 'fc-amount', 'fc-note', 'fc-since', 'liab-name', 'liab-amount',
   'liab-due', 'liab-note', 'pass-old', 'pass-new1', 'pass-new2', 'dash-search', 'cat-new', 'cat-new-inc', 'restore-pass'].forEach(id => {
    const el = $(id); if (el) el.value = '';
  });
  $('fc-usage').value = 'privat'; $('fc-active').checked = false; $('restore-file-name').textContent = ''; $('restore-err').textContent = '';
  ['expense-modal-title', 'fixed-modal-title', 'liab-modal-title'].forEach(id => { $(id).textContent = ''; });
  ['modal-expense', 'modal-fixed', 'modal-liab', 'modal-restore'].forEach(id => $(id).classList.remove('open'));
  pendingRestore = null; restoreSrc = null; lastFocus = null;
  $('help-overlay').classList.add('hidden');
  dialogClose(false); hideToast();   // offene Rückfrage verfällt (Aufrufer sieht false), Toast samt „Rückgängig“ weg (v1.9)
  maskPasswordFields();
  $('liab-open-total').classList.remove('warn');
  $('set-autolock').value = '5';
  closeMenus(); syncCombos();   // Menüs tragen Kategorienamen; Knopfbeschriftungen den geleerten Selects anpassen
  pendingLiabId = null; editingLiabId = null; editingExpenseId = null; editingFixedId = null;
  markKind('expense'); $('exp-kind-group').style.display = '';   // Art-Umschalter zurück (v1.12), ohne Kategorien zu füllen
  $('expense-modal-title').dataset.i18n = 'modal.expenseAdd';
  kindCat = { expense: '', income: '' }; sessCat = {};   // gemerkte Kategorienamen sind Nutzerdaten
  dashData = null; searchQ = ''; catFilter = new Set(); catCounts = new Map();
  categories = []; settings = { autolock: 5 };
  showTabSilent('dashboard');
  appReady = false;   // nach dem nächsten Entsperren rendert init() alles frisch
}
function showTabSilent(name) {
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.toggle('visible', t.id === 'tab-' + name));
}

function lockApp() {
  if (curRead) { const r = curRead.reader; curRead = null; try { r.abort(); } catch (_) { /* schon fertig */ } }   // nie im gesperrten Zustand fertig lesen
  window.LocalDB.lock();
  clearIdle();
  clearRendered();
  showAuth();
}
// Auto-Sperre: erst sperren, dann melden (clearRendered räumt den Toast). Wurde dabei ein Import zurückgestellt, sagt der Toast das (v1.11).
// War das Restore-Modal schon offen (Datei vor der Sperre gelesen, Reihenfolge der Ereignisse nach dem Picker ist nicht garantiert), wird sein
// Verweis ebenfalls zurückgestellt statt verworfen. Nur hier, nicht beim Sperren von Hand.
function autoLock() {
  const src = (pendingRestore && restoreSrc) || (curRead && curRead.fromSession && curRead.file) || null;   // offenes Modal oder laufende Lesung
  lockApp();
  if (src) deferFile(src); else showToast(I18N.t('toast.autolocked'));
}

// Enter-Taste in den Passwortfeldern
$('setup-pass2').addEventListener('keydown', e => { if (e.key === 'Enter') doSetup(); });
$('unlock-pass').addEventListener('keydown', e => { if (e.key === 'Enter') doUnlock(); });

// --- AUTO-LOCK (Minuten aus den Einstellungen, 0 = aus) ---
let idleTimer = null;
function autolockMs() { return Number(settings.autolock) > 0 ? Number(settings.autolock) * 60000 : 0; }
function clearIdle() { if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; } }
function resetIdle() {
  clearIdle();
  if (!window.LocalDB.isUnlocked()) return;
  const ms = autolockMs();
  if (!ms) return;
  idleTimer = setTimeout(autoLock, ms);
}
['click', 'keydown', 'touchstart', 'scroll', 'mousemove'].forEach(evt =>
  document.addEventListener(evt, () => { if (window.LocalDB.isUnlocked()) resetIdle(); }, { passive: true }));
// Backgrounding: setTimeout pausiert in eingefrorenen WebViews — beim Zurückkehren
// die tatsächlich verstrichene Zeit prüfen und ggf. sofort sperren.
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (!window.LocalDB.isUnlocked()) return;
  if (document.hidden) { hiddenAt = Date.now(); return; }
  const away = hiddenAt ? Date.now() - hiddenAt : 0; hiddenAt = 0;
  const ms = autolockMs();
  // away < 0: Uhr im Hintergrund zurückgestellt — die Wegzeit ist dann unbekannt, also sperren statt den Timer neu zu starten (R3 M1)
  if (ms && (away > ms || away < 0)) autoLock();
  else { resetIdle(); followToday(true); }   // Monatswechsel im Hintergrund: Ansicht rückt mit, Folgemonat wieder erreichbar (R2 M-1)
});

// --- SPRACHE (DE/EN) ---
function updateLangToggle() {
  const b = $('lang-toggle');
  if (b) b.textContent = I18N.lang.toUpperCase();
  document.querySelectorAll('.pw-eye').forEach(btn => btn.setAttribute('aria-label', I18N.t('pw.toggle')));
}
function rerenderCurrentView() {
  populateExportMonths();
  updateMonthLabel();
  const active = document.querySelector('.nav-tab.active');
  const v = active ? active.dataset.tab : 'dashboard';
  if (v === 'dashboard') loadDashboard();
  else if (v === 'annual') loadAnnual();
  else if (v === 'fixed') loadFixedCosts();
  else if (v === 'liab') loadLiabilities();
  else if (v === 'settings') renderSettings();
  if (!$('help-overlay').classList.contains('hidden')) $('help-about').textContent = I18N.t('about', { v: APP_VERSION });
}
function toggleLang() {
  I18N.setLang(I18N.lang === 'de' ? 'en' : 'de');
  I18N.applyStatic();
  closeMenus(); syncCombos();   // Optionen mit data-i18n (Auto-Lock, Nutzung) haben neue Texte
  updateLangToggle();
  if (!document.body.classList.contains('locked')) rerenderCurrentView();
}
$('lang-toggle').addEventListener('click', toggleLang);

// Jedes Passwortfeld mit "anzeigen/verbergen"-Auge ausstatten (Copy/Paste/Autofill
// sind in manchen Android-WebViews unzuverlässig — so kann man die Eingabe prüfen).
function enhancePasswordFields() {
  document.querySelectorAll('input[type="password"]').forEach(inp => {
    if (inp.dataset.pwEnhanced) return;
    inp.dataset.pwEnhanced = '1';
    const wrap = document.createElement('span');
    wrap.className = 'pw-wrap';
    inp.parentNode.insertBefore(wrap, inp);
    wrap.appendChild(inp);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pw-eye';   // Symbol als CSS-Maske (v1.9, Kit-Stand), Zustand in aria-pressed
    btn.setAttribute('aria-label', I18N.t('pw.toggle'));
    btn.setAttribute('aria-pressed', 'false');
    btn.dataset.showpass = inp.id;
    btn.addEventListener('mousedown', e => e.preventDefault());   // Fokus und Tastatur bleiben im Feld
    // Tastaturweg (Tab aufs Auge, Enter): das Feld hat keinen Fokus, focus() holt die alte Markierung zurück — im Klartext aufs Ende ziehen (Audit v1.11 a1)
    btn.addEventListener('click', () => { setEye(btn, inp.type === 'password'); inp.focus(); collapseRevealed(inp); });
    inp.addEventListener('focus', () => collapseRevealed(inp));   // Tab in ein aufgedecktes Feld markiert alles (nur Anzeige; ohne Timer, der zerstörte schnelle Nutzermarkierungen, R2 #3)
    wrap.appendChild(btn);
  });
}
// Kit-Stand Alien Notes v1.6 / Sachwert-Tresor v3.7: Chromium setzt beim type-Wechsel die Auswahl auf 0, im Desktop-Browser nach
// einem echten Mausklick sogar erst verspätet — darum sofort UND per setTimeout wiederherstellen, nur bei unverändertem Fokus/Typ/Wert.
// Headless-Brave zeigt den Fehler nicht (Gerätetest im Desktop-Browser).
function setEye(btn, on) {
  btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  const f = $(btn.dataset.showpass); if (!f) return;
  const keep = document.activeElement === f, s = f.selectionStart, e = f.selectionEnd, d = f.selectionDirection || 'none', v = f.value, ty = on ? 'text' : 'password';
  // Beim Aufdecken eine Markierung nicht als Klartext-Markierung wiederherstellen (X11 legt markierten Text in PRIMARY) — Cursor ans Ende (Notes run-4 B-V1).
  // Schon VOR dem Typwechsel zusammenziehen, sonst steht sie einen Takt lang markiert im Klartext (Audit v1.11 a4) — auch OHNE Fokus: beim
  // Tastaturweg (Tab aufs Auge, Enter) stellt inp.focus() die gemerkte Markierung noch im Tastenereignis her, und Chromium legt sie dann
  // sofort in PRIMARY (Audit v1.11 R2 F1). Ohne Fokus setzt das nur die gemerkte Auswahl, holt keinen Fokus.
  const s2 = on && s !== e ? e : s;
  if (s2 !== s) try { f.setSelectionRange(s2, e, d); } catch (_) {}
  f.type = ty; if (!keep || s == null) return;
  const put = () => { if (document.activeElement === f && f.type === ty && f.value === v) try { f.setSelectionRange(s2, e, d); } catch (_) {} };
  put(); setTimeout(put, 0);
}
function collapseRevealed(f) {
  if (f.type === 'text' && document.activeElement === f && f.selectionStart !== f.selectionEnd) try { f.setSelectionRange(f.selectionEnd, f.selectionEnd); } catch (_) {}
}
// Sperr-Hygiene: alle Augen zu, Felder maskiert (Sperren, Fehlversuch)
function maskPasswordFields() {
  document.querySelectorAll('.pw-eye[data-showpass]').forEach(btn => setEye(btn, false));
}

// --- EVENT-DELEGATION (statt onclick-Attributen; CSP script-src ohne 'unsafe-inline') ---
// Buttons tragen data-action (+ data-id / data-arg). Modal-Overlays tragen zusätzlich
// data-overlay="1" und schließen nur bei Klick auf den Hintergrund selbst.
const ACTIONS = {
  setup: () => doSetup(),
  unlock: () => doUnlock(),
  restore: pickRestore,
  lock: () => lockApp(),
  prevMonth: () => prevMonth(), nextMonth: () => nextMonth(),
  prevYear: () => prevYear(), nextYear: () => nextYear(),
  openExpense: (id) => openExpenseModal(id), closeExpense: () => closeExpenseModal(), saveExpense: () => saveExpense(),
  deleteExpense: (id) => deleteExpense(id),
  openFixed: (id) => openFixedModal(id), closeFixed: () => closeFixedModal(), saveFixed: () => saveFixed(),
  toggleFixed: (id, arg) => toggleFixed(id, arg === '1'), deleteFixed: (id) => deleteFixed(id),
  selectPeriod: (_, arg) => selectPeriod(arg),
  openLiab: (id) => openLiabModal(id), closeLiab: () => closeLiabModal(), saveLiab: () => saveLiab(),
  toggleLiab: (id, arg) => toggleLiab(id, arg === '1'), deleteLiab: (id) => deleteLiab(id), bookLiab: (id) => bookLiab(id),
  downloadCSV: () => downloadCSV(), downloadFixedSummary: () => downloadFixedSummary(),
  exportBackup: () => exportBackup(),
  closeRestore: () => closeRestore(), saveRestore: () => saveRestore(),
  saveChangePass: () => saveChangePass(),
  theme: (_, arg) => theme(arg),
  addCategory: (_, arg) => addCategory(arg), catEdit: (id) => catEdit(id), catSave: (id) => catSave(id),
  setKind: (_, arg) => { if (arg !== expKind) setKind(arg); },   // Tipp auf die schon aktive Art ändert nichts (Review v1.12 N1)
  catCancel: () => renderCategoryList(), catDelete: (id) => catDelete(id),
  chip: (_, arg) => setChip(arg), chipAll: () => setChip(null),
  openHelp: () => openHelp(), closeHelp: () => closeHelp(),
  toggleCombo: (_, arg) => toggleCombo(arg), chooseOpt: (_, arg, el) => chooseOpt(arg, el),
  dialogOk: () => dialogOk(), dialogCancel: () => dialogCancel(), toastAction: () => toastAction(),
};
const CHANGES = {
  setAutolock: (el) => setAutolock(el.value),
};
document.addEventListener('click', e => {
  if (!e.target.closest('.combo')) closeMenus();   // Klick außerhalb eines Auswahlfelds schließt jedes offene Menü
  const el = e.target.closest('[data-action]');
  if (!el) return;
  if (el.dataset.overlay && e.target !== el) return;   // Klick im Modal-Inhalt, nicht auf den Hintergrund
  const fn = ACTIONS[el.dataset.action];
  if (fn) fn(el.dataset.id || undefined, el.dataset.arg, el);
});
document.addEventListener('change', e => {
  const el = e.target.closest('[data-change]');
  if (!el) return;
  const fn = CHANGES[el.dataset.change];
  if (fn) fn(el);
});
// ESC: offenes Auswahlmenü, sonst Handbuch, sonst offenes Modal schließen
document.addEventListener('keydown', e => {
  if (dialogKey(e)) { e.preventDefault(); return; }   // offener Dialog: Escape bricht ab, Tab pendelt (v1.9)
  // Enter in Feldern mit data-enter löst deren Aktion aus (v1.12: „Neue Kategorie“ beider Listen); preventDefault wie im Kit
  if (e.key === 'Enter' && !e.isComposing && e.target && e.target.closest) {
    const el = e.target.closest('[data-enter]');
    if (el) { e.preventDefault(); const fn = ACTIONS[el.dataset.enter]; if (fn) fn(el.dataset.id || undefined, el.dataset.arg, el); return; }
  }
  if (e.key !== 'Escape') return;
  if (document.querySelector('.combo-menu:not(.hidden)')) { closeMenus(); return; }
  if (!$('help-overlay').classList.contains('hidden')) { closeHelp(); return; }
  if ($('modal-expense').classList.contains('open')) closeExpenseModal();
  else if ($('modal-fixed').classList.contains('open')) closeFixedModal();
  else if ($('modal-liab').classList.contains('open')) closeLiabModal();
  else if ($('modal-restore').classList.contains('open')) closeRestore();
});
$('restore-file').addEventListener('change', restoreBackup);
document.querySelectorAll('form.auth-form').forEach(f => f.addEventListener('submit', e => e.preventDefault()));

// --- START ---
document.documentElement.lang = I18N.lang;
I18N.applyStatic();
syncCombos();
updateLangToggle();
enhancePasswordFields();
updateThemeSeg();
showAuth();
