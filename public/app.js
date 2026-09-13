'use strict';
// app.js — UI-Logik des Ausgaben-Trackers. Klassisches Skript (keine Module): die Funktionen sind
// global, damit die E2E-Suiten (verify-*.mjs) sie direkt aufrufen können.
const APP_VERSION = '1.7';   // Anzeige in den Einstellungen; muss VERSION_NAME in apk/VERSION entsprechen (build-www.sh setzt es aus VERSION, check-version.mjs prüft es)

const monthName = (i) => I18N.monthName(i);        // lokalisierter Monatsname (Januar / January)
const monthShort = (i) => I18N.monthName(i, true); // kurz (Jan)

const today = new Date();
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
}
// Text- UND attributsicher (auch " und ' werden ersetzt) — gilt für alles, was in
// Template-Strings landet, inkl. data-id-Attribute der Aktionsbuttons.
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function escapeHtml(str) { return String(str).replace(/[&<>"']/g, c => ESC[c]); }
const $ = (id) => document.getElementById(id);
// Suche: Groß-/Kleinschreibung und Akzente ignorieren (ä = a, é = e)
function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }

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

function populateCategorySelects() {
  const opts = categories.map(c => `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)}</option>`).join('');
  $('exp-category').innerHTML = opts;
  $('fc-category').innerHTML = opts;
  // Export year
  const curYear = today.getFullYear();
  let yearOpts = '';
  for (let y = curYear; y >= curYear - 5; y--) yearOpts += `<option value="${y}">${y}</option>`;
  $('export-year').innerHTML = yearOpts;
  populateExportMonths();
}

// Monats-Dropdown im Export-Tab lokalisiert befüllen (Auswahl bleibt erhalten)
function populateExportMonths() {
  const sel = $('export-month');
  const prev = sel.value;
  let html = `<option value="">${escapeHtml(I18N.t('export.wholeYear'))}</option>`;
  for (let m = 1; m <= 12; m++) html += `<option value="${m}">${escapeHtml(monthName(m - 1))}</option>`;
  sel.innerHTML = html;
  sel.value = prev;
}

// --- Tab switching ---
function showTab(name) {
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
function updateMonthLabel() {
  const isCurrentMonth = dashYear === today.getFullYear() && dashMonth === today.getMonth() + 1;
  $('month-label').innerHTML = `${escapeHtml(monthName(dashMonth - 1))} <span class="year-hint">${dashYear}</span>`;
  $('btn-next-month').disabled = isCurrentMonth;
}

function prevMonth() {
  dashMonth--;
  if (dashMonth < 1) { dashMonth = 12; dashYear--; }
  updateMonthLabel();
  loadDashboard();
}

function nextMonth() {
  const isCurrentMonth = dashYear === today.getFullYear() && dashMonth === today.getMonth() + 1;
  if (isCurrentMonth) return;
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

function renderDashboard(data) {
  dashData = data;
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

  // Kategorie-Chips: nur Kategorien mit Einträgen im Monat; gewählte Chips bleiben, wenn noch vorhanden
  const present = [...sums.keys()].sort((a, b) => a.localeCompare(b, I18N.locale()));
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

  let expHtml = '';
  if (data.current_expenses.length === 0) {
    expHtml = `<div class="empty-state">${ICON.svg('coins', 'lg')}<div>${I18N.t('dash.emptyExpense')}</div></div>`;
  } else if (exps.length === 0) {
    expHtml = `<div class="empty-state">${I18N.t('dash.noMatch')}</div>`;
  } else {
    expHtml = exps.map(e => `
      <div class="expense-item">
        <div class="item-left">
          <div class="item-name">${escapeHtml(e.name)}</div>
          <div class="item-meta">
            <span class="cat-tag">${escapeHtml(e.category)}</span>
            <span class="item-date">${formatDateDE(e.date)}</span>
            ${e.note ? `<span class="item-note">${escapeHtml(e.note)}</span>` : ''}
          </div>
        </div>
        <div class="item-right">
          <div class="item-amount">${eur(e.amount)}</div>
          <div class="item-actions">
            <button class="action-btn" data-action="openExpense" data-id="${escapeHtml(e.id)}" title="${escapeHtml(I18N.t('modal.expenseEdit'))}" aria-label="${escapeHtml(I18N.t('modal.expenseEdit'))}">${ICON.svg('edit')}</button>
            <button class="action-btn danger" data-action="deleteExpense" data-id="${escapeHtml(e.id)}" title="${escapeHtml(I18N.t('confirm.delExpense'))}" aria-label="${escapeHtml(I18N.t('confirm.delExpense'))}">${ICON.svg('trash')}</button>
          </div>
        </div>
      </div>`).join('');
  }

  const fixedSum = fixed.reduce((s, fc) => s + monthlyOf(fc), 0);
  const expSum = exps.reduce((s, e) => s + Number(e.amount || 0), 0);
  const total = data.active_fixed_costs.length + data.current_expenses.length;
  $('dashboard-content').innerHTML = `
    ${filtering ? `<div class="muted" style="margin-bottom:4px">${I18N.t('dash.filtered', { n: fixed.length + exps.length, total })}</div>` : ''}
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
  if (annualYear >= today.getFullYear()) return;
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
  const curYearMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
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
  m.classList.remove('open');
  if (lastFocus && document.body.contains(lastFocus) && typeof lastFocus.focus === 'function') lastFocus.focus();
  lastFocus = null;
}

// --- EXPENSE MODAL ---
function openExpenseModal(id) {
  editingExpenseId = id || null;
  pendingLiabId = null;
  const isEdit = !!id;
  $('expense-modal-title').textContent = I18N.t(isEdit ? 'modal.expenseEdit' : 'modal.expenseAdd');
  $('exp-date').value = todayISO();
  $('exp-name').value = '';
  $('exp-amount').value = '';
  $('exp-note').value = '';
  if (isEdit) loadExpenseForEdit(id);
  openModal('modal-expense', 'exp-name');
}

async function loadExpenseForEdit(id) {
  try {
    const list = await apiFetch('GET', `/api/expenses?year=${dashYear}&month=${dashMonth}`);
    const exp = list.find(e => e.id === id);
    if (!exp || !unlocked()) return;
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

  const body = {
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
      showToast(I18N.t('toast.expUpdated'));
    } else {
      const liabId = pendingLiabId;   // VOR dem await sichern (Overlay-Klick könnte die Variable währenddessen nullen)
      await apiFetch('POST', '/api/expenses', body);
      if (liabId) {
        await apiFetch('PATCH', `/api/liabilities/${liabId}`, { done: true });
        showToast(I18N.t('toast.liabBooked'));
        loadLiabilities();
      } else {
        showToast(I18N.t('toast.expSaved'));
      }
    }
    closeExpenseModal();
    loadDashboard();
  } catch (e) {
    showToast(tErr(e), true);
  } finally {
    btn.disabled = false;
  }
}

async function deleteExpense(id) {
  if (!confirm(I18N.t('confirm.delExpense'))) return;
  try {
    await apiFetch('DELETE', `/api/expenses/${id}`);
    showToast(I18N.t('toast.deleted'));
    loadDashboard();
  } catch (e) {
    showToast(tErr(e), true);
  }
}

// --- FIXED COST MODAL ---
function selectPeriod(p) {
  selectedPeriod = p;
  document.querySelectorAll('.period-pill').forEach(el => {
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
  $('fc-usage').value = 'privat';
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
    $('fc-usage').value = fc.usage || 'privat';
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
  if (!confirm(I18N.t('confirm.delFixed'))) return;
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
    $('expense-modal-title').textContent = I18N.t('modal.bookExpense');
    $('exp-name').value = l.name;
    $('exp-amount').value = l.amount;
    $('exp-note').value = l.note || I18N.t('liab.bookNote');
  } catch (e) {
    showToast(tErr(e), true);
  }
}

async function deleteLiab(id) {
  if (!confirm(I18N.t('confirm.delLiab'))) return;
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
    const d = new Date().toISOString().substring(0, 10);
    await saveFile(`ausgaben-tracker-${d}.vault`, raw, 'application/octet-stream');
    showToast(I18N.t('toast.backupExported'));
  } catch (e) { showToast(tErr(e), true); }
}

// Backup wiederherstellen: Datei lesen → Struktur prüfen → Passwort des Backups abfragen → erst wenn
// das Backup entschlüsselt ist, wird der gespeicherte Tresor ersetzt (Audit run-1 #1). Auch vom
// Sperrbildschirm aus möglich; eine unbrauchbare Datei kann die vorhandenen Daten nicht zerstören.
const RESTORE_MAX_BYTES = 8 * 1024 * 1024;
let pendingRestore = null;
function restoreBackup(event) {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;
  if (file.size > RESTORE_MAX_BYTES) { showToast(I18N.t('err.tooLarge'), true); return; }
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const content = String(reader.result);
      window.LocalDB.checkBackup(content);
      pendingRestore = content;
      $('restore-file-name').textContent = I18N.t('restore.file', { name: file.name });
      $('restore-pass').value = ''; $('restore-err').textContent = '';
      openModal('modal-restore', 'restore-pass');
    } catch (e) { showToast(tErr(e), true); }
  };
  reader.readAsText(file);
}
function closeRestore() { pendingRestore = null; $('restore-pass').value = ''; closeModal('modal-restore'); }
async function saveRestore() {
  if (!pendingRestore) return;
  const btn = $('btn-restore'); const errEl = $('restore-err');
  errEl.textContent = ''; btn.disabled = true;
  try {
    await window.LocalDB.restoreVault(pendingRestore, $('restore-pass').value);
    pendingRestore = null;
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
  $('set-autolock').value = String(settings.autolock);
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
    catCounts = new Map();
    [...ex, ...fc].forEach(e => catCounts.set(e.category, (catCounts.get(e.category) || 0) + 1));
  } catch (e) { catCounts = new Map(); }
  if (!unlocked()) return;
  $('cat-list').innerHTML = categories.map(c => `
    <div class="cat-row" data-cat-id="${escapeHtml(c.id)}">
      <span class="cat-name">${escapeHtml(c.name)}</span>
      <span class="cat-count">${(catCounts.get(c.name) || 0) === 1 ? I18N.t('set.catCount1') : I18N.t('set.catCount', { n: catCounts.get(c.name) || 0 })}</span>
      <button class="action-btn" data-action="catEdit" data-id="${escapeHtml(c.id)}" title="${escapeHtml(I18N.t('set.catRename'))}" aria-label="${escapeHtml(I18N.t('set.catRename'))}">${ICON.svg('edit')}</button>
      <button class="action-btn danger" data-action="catDelete" data-id="${escapeHtml(c.id)}" title="${escapeHtml(I18N.t('set.catDelete'))}" aria-label="${escapeHtml(I18N.t('set.catDelete'))}">${ICON.svg('trash')}</button>
    </div>`).join('');
}
async function afterCategoryChange(toastKey, vars) {
  await loadCategories();
  await renderCategoryList();
  if (dashData) loadDashboard();
  showToast(I18N.t(toastKey, vars));
}
async function addCategory() {
  const inp = $('cat-new');
  const name = inp.value.trim();
  if (!name) return;
  try {
    await apiFetch('POST', '/api/categories', { name });
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
  const inp = $('cat-edit-input');
  inp.focus(); inp.select();
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') catSave(id); if (e.key === 'Escape') renderCategoryList(); });
}
async function catSave(id) {
  const inp = $('cat-edit-input');
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
    if (!confirm(I18N.t('confirm.delCat', { name: c.name, fb: target }))) return;
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
function showToast(msg, isError) {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'toast ' + (isError ? 'err' : 'ok') + ' show';
  setTimeout(() => t.classList.remove('show'), 2800);
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
async function init() {
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
  setTimeout(() => focusEl && focusEl.focus(), 100);
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
  try {
    await window.LocalDB.unlock($('unlock-pass').value);
    $('unlock-pass').value = '';
    enterApp();
  } catch (e) {
    errEl.textContent = tErr(e);
  } finally { btn.disabled = false; btn.textContent = I18N.t('auth.unlockBtn'); }
}

// Nach dem Sperren darf nichts Entschlüsseltes im (verdeckten) DOM lesbar bleiben
function clearRendered() {
  ['dashboard-content', 'dash-cats', 'dash-chips', 'summary-cards', 'annual-content', 'fixed-content', 'liab-content',
   'exp-category', 'fc-category', 'cat-list'].forEach(id => {
    const el = $(id); if (el) el.innerHTML = '';
  });
  ['fc-monthly-total', 'fc-yearly-total', 'month-label', 'liab-open-total', 'liab-open-count', 'liab-count-sub', 'about-line', 'help-about'].forEach(id => {
    const el = $(id); if (el) el.textContent = '';
  });
  ['exp-name', 'exp-amount', 'exp-note', 'exp-date', 'fc-name', 'fc-amount', 'fc-note', 'fc-since', 'liab-name', 'liab-amount',
   'liab-due', 'liab-note', 'pass-old', 'pass-new1', 'pass-new2', 'dash-search', 'cat-new', 'restore-pass'].forEach(id => {
    const el = $(id); if (el) el.value = '';
  });
  $('fc-usage').value = 'privat'; $('fc-active').checked = false; $('restore-file-name').textContent = '';
  ['expense-modal-title', 'fixed-modal-title', 'liab-modal-title'].forEach(id => { $(id).textContent = ''; });
  ['modal-expense', 'modal-fixed', 'modal-liab', 'modal-restore'].forEach(id => $(id).classList.remove('open'));
  pendingRestore = null; lastFocus = null;
  $('help-overlay').classList.add('hidden');
  $('liab-open-total').classList.remove('warn');
  $('set-autolock').value = '5';
  pendingLiabId = null; editingLiabId = null; editingExpenseId = null; editingFixedId = null;
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
  window.LocalDB.lock();
  clearIdle();
  clearRendered();
  showAuth();
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
  idleTimer = setTimeout(() => { showToast(I18N.t('toast.autolocked')); lockApp(); }, ms);
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
  if (ms && away > ms) { showToast(I18N.t('toast.autolocked')); lockApp(); }
  else resetIdle();
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
    btn.className = 'pw-eye';
    btn.setAttribute('aria-label', I18N.t('pw.toggle'));
    btn.innerHTML = ICON.svg('eye');
    btn.addEventListener('click', () => {
      const show = inp.type === 'password';
      inp.type = show ? 'text' : 'password';
      btn.innerHTML = ICON.svg(show ? 'eyeOff' : 'eye');
      inp.focus();
    });
    wrap.appendChild(btn);
  });
}

// --- EVENT-DELEGATION (statt onclick-Attributen; CSP script-src ohne 'unsafe-inline') ---
// Buttons tragen data-action (+ data-id / data-arg). Modal-Overlays tragen zusätzlich
// data-overlay="1" und schließen nur bei Klick auf den Hintergrund selbst.
const ACTIONS = {
  setup: () => doSetup(),
  unlock: () => doUnlock(),
  restore: () => $('restore-file').click(),
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
  addCategory: () => addCategory(), catEdit: (id) => catEdit(id), catSave: (id) => catSave(id),
  catCancel: () => renderCategoryList(), catDelete: (id) => catDelete(id),
  chip: (_, arg) => setChip(arg), chipAll: () => setChip(null),
  openHelp: () => openHelp(), closeHelp: () => closeHelp(),
};
const CHANGES = {
  setAutolock: (el) => setAutolock(el.value),
};
document.addEventListener('click', e => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  if (el.dataset.overlay && e.target !== el) return;   // Klick im Modal-Inhalt, nicht auf den Hintergrund
  const fn = ACTIONS[el.dataset.action];
  if (fn) fn(el.dataset.id || undefined, el.dataset.arg);
});
document.addEventListener('change', e => {
  const el = e.target.closest('[data-change]');
  if (!el) return;
  const fn = CHANGES[el.dataset.change];
  if (fn) fn(el);
});
// ESC: Handbuch, sonst offenes Modal schließen
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
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
updateLangToggle();
enhancePasswordFields();
updateThemeSeg();
showAuth();
