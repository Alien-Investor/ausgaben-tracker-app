'use strict';
// i18n.js — DE/EN für den Ausgaben-Tracker. UI-Strings im Wörterbuch, t(key,vars) für
// JS, data-i18n / data-i18n-ph für statisches HTML. Sprache in localStorage 'ausg-lang'.
window.I18N = (function () {
  const LS = 'ausg-lang';
  let lang = localStorage.getItem(LS) || 'de';

  const UI = {
    de: {
      'app.title': 'Ausgaben-Tracker',
      'header.subtitle': 'Alien Investor · Persönliche Finanzen',
      'nav.overview': 'Übersicht', 'nav.annual': 'Jahresübers.', 'nav.fixed': 'Fixkosten', 'nav.export': 'Export',
      'dash.total': 'Gesamt', 'dash.fixed': 'Fixkosten', 'dash.variable': 'Variabel', 'dash.vsPrev': 'vs Vormonat',
      'dash.monthlyLoad': 'monatl. Last', 'dash.entered': 'eingetragen', 'dash.before': '{x} vorher',
      'dash.sectionFixed': 'Fixkosten', 'dash.sectionVariable': 'Variable Ausgaben',
      'dash.emptyFixed': 'Keine aktiven Fixkosten', 'dash.emptyExpense': 'Noch keine variablen Ausgaben',
      'annual.month': 'Monat', 'annual.fixed': 'Fixkosten', 'annual.variable': 'Variabel', 'annual.total': 'Gesamt',
      'annual.totalYear': 'Gesamt {year}',
      'fixed.monthly': 'Monatlich', 'fixed.fixedTotal': 'Fixkosten gesamt', 'fixed.yearly': 'Jährlich', 'fixed.projection': 'Projektion',
      'fixed.addBtn': '+ Fixkosten hinzufügen', 'fixed.inactiveSince': 'Inaktiv seit {date}', 'fixed.inactive': 'Inaktiv',
      'fixed.inactiveSection': 'Inaktive Einträge', 'fixed.empty': 'Noch keine Fixkosten angelegt',
      'fixed.perYear': '{x}/Jahr', 'fixed.perMonth': '{x}/Monat', 'fixed.yearToMonth': '{a}/Jahr → {b}/Mo',
      'fixed.perMoShort': '/Mo', 'fixed.sinceShort': 'seit {m} {y}',
      'usage.privat': 'privat', 'usage.betrieblich': 'betrieblich', 'usage.anteilig': 'anteilig',
      'export.csvTitle': 'CSV-Export', 'export.year': 'Jahr', 'export.monthOpt': 'Monat (optional)', 'export.wholeYear': 'Ganzes Jahr',
      'export.downloadCsv': 'CSV herunterladen', 'export.fixedSummary': 'Fixkosten-Zusammenfassung (CSV)',
      'export.hint': '<strong>CSV herunterladen:</strong> alle variablen Ausgaben und Fixkosten (monatlich amortisiert) im gewählten Zeitraum — jede Fixkostenposition pro Monat eine Zeile.<br><strong>Fixkosten-Zusammenfassung:</strong> jede Fixkostenposition nur <em>einmal</em>, mit Monats- und Jahresbetrag, sortiert nach Höhe — ideal zum Ausmisten. Stichtag ist der gewählte Monat (ohne Monatswahl der aktuelle Monat).<br>Beide kompatibel mit Excel, LibreOffice Calc und Google Sheets.',
      'export.backupTitle': 'Backup & Daten', 'export.backupExport': 'Verschlüsseltes Backup exportieren (.vault)',
      'export.backupRestore': 'Backup wiederherstellen (.vault)', 'export.changePass': 'Master-Passwort ändern',
      'export.backupHint': 'Das <strong>.vault</strong>-Backup ist mit deinem Master-Passwort verschlüsselt — der einzige Weg, Daten auf ein anderes Gerät zu übertragen. Nach dem Wiederherstellen entsperrst du mit dem Passwort des Backups.',
      'modal.expenseAdd': 'Ausgabe hinzufügen', 'modal.expenseEdit': 'Ausgabe bearbeiten',
      'modal.fixedAdd': 'Fixkosten hinzufügen', 'modal.fixedEdit': 'Fixkosten bearbeiten',
      'modal.label': 'Bezeichnung *', 'modal.amount': 'Betrag (€) *', 'modal.date': 'Datum', 'modal.category': 'Kategorie',
      'modal.note': 'Notiz (optional)', 'modal.cancel': 'Abbrechen', 'modal.save': 'Speichern',
      'modal.since': 'Seit', 'modal.interval': 'Intervall', 'modal.monthly': 'Monatlich', 'modal.yearly': 'Jährlich',
      'modal.usage': 'Steuerliche Nutzung', 'modal.usagePrivat': 'Privat', 'modal.usageBetrieblich': 'Betrieblich (voll absetzbar)',
      'modal.usageAnteilig': 'Anteilig (gemischt)', 'modal.active': 'Aktiv (abschalten deaktiviert den Eintrag)',
      'modal.passTitle': 'Master-Passwort ändern', 'modal.passOld': 'Aktuelles Passwort',
      'modal.passNew': 'Neues Passwort (min. 8 Zeichen)', 'modal.passNew2': 'Neues Passwort wiederholen', 'modal.change': 'Ändern',
      'ph.expName': 'z.B. Supermarkt Rewe', 'ph.fcName': 'z.B. Netflix, Miete, KFZ-Versicherung', 'ph.amount': '0,00',
      'auth.setupTitle': 'Tresor einrichten',
      'auth.setupHint': 'Vergib ein Master-Passwort. Es verschlüsselt alle Daten lokal auf dem Gerät — ohne dieses Passwort gibt es keinen Zugriff und keine Wiederherstellung.',
      'auth.setupPh1': 'Passwort (min. 8 Zeichen)', 'auth.setupPh2': 'Passwort wiederholen', 'auth.setupBtn': 'Tresor erstellen',
      'auth.unlockHint': 'Master-Passwort eingeben, um die verschlüsselten Daten zu entsperren.',
      'auth.unlockPh': 'Master-Passwort', 'auth.unlockBtn': 'Entsperren', 'auth.unlocking': 'Entschlüssele…',
      'auth.restore': 'Aus Backup wiederherstellen (.vault)',
      'addBtn.title': 'Ausgabe hinzufügen', 'btn.lock': 'Sperren',
      'toast.expSaved': 'Ausgabe gespeichert', 'toast.expUpdated': 'Ausgabe aktualisiert', 'toast.deleted': 'Gelöscht',
      'toast.fcAdded': 'Fixkosten hinzugefügt', 'toast.fcUpdated': 'Fixkosten aktualisiert',
      'toast.activated': 'Aktiviert', 'toast.deactivated': 'Deaktiviert',
      'toast.csv': 'CSV exportiert', 'toast.fixedSummary': 'Fixkosten-Zusammenfassung exportiert',
      'toast.backupExported': 'Backup exportiert', 'toast.backupLoaded': 'Backup geladen — bitte entsperren',
      'toast.passChanged': 'Passwort geändert', 'toast.vaultCreated': 'Tresor erstellt', 'toast.autolocked': 'Automatisch gesperrt',
      'toast.reqFields': 'Name und Betrag sind Pflichtfelder', 'toast.passMismatch': 'Passwörter stimmen nicht überein',
      'toast.noVault': 'Kein Vault vorhanden',
      'confirm.delExpense': 'Ausgabe löschen?', 'confirm.delFixed': 'Fixkosten-Eintrag dauerhaft löschen?',
      'confirm.restore': 'Aktuelle Daten durch das Backup ersetzen? Danach mit dem Passwort des Backups entsperren.',
      'err.prefix': 'Fehler: ', 'err.wrongPass': 'Falsches Passwort', 'err.shortPass': 'Passwort muss mindestens 8 Zeichen haben',
    },
    en: {
      'app.title': 'Expense Tracker',
      'header.subtitle': 'Alien Investor · Personal Finance',
      'nav.overview': 'Overview', 'nav.annual': 'Annual', 'nav.fixed': 'Fixed costs', 'nav.export': 'Export',
      'dash.total': 'Total', 'dash.fixed': 'Fixed', 'dash.variable': 'Variable', 'dash.vsPrev': 'vs prev. month',
      'dash.monthlyLoad': 'monthly load', 'dash.entered': 'logged', 'dash.before': '{x} before',
      'dash.sectionFixed': 'Fixed costs', 'dash.sectionVariable': 'Variable expenses',
      'dash.emptyFixed': 'No active fixed costs', 'dash.emptyExpense': 'No variable expenses yet',
      'annual.month': 'Month', 'annual.fixed': 'Fixed', 'annual.variable': 'Variable', 'annual.total': 'Total',
      'annual.totalYear': 'Total {year}',
      'fixed.monthly': 'Monthly', 'fixed.fixedTotal': 'fixed costs total', 'fixed.yearly': 'Yearly', 'fixed.projection': 'projection',
      'fixed.addBtn': '+ Add fixed cost', 'fixed.inactiveSince': 'Inactive since {date}', 'fixed.inactive': 'Inactive',
      'fixed.inactiveSection': 'Inactive entries', 'fixed.empty': 'No fixed costs yet',
      'fixed.perYear': '{x}/year', 'fixed.perMonth': '{x}/month', 'fixed.yearToMonth': '{a}/year → {b}/mo',
      'fixed.perMoShort': '/mo', 'fixed.sinceShort': 'since {m} {y}',
      'usage.privat': 'private', 'usage.betrieblich': 'business', 'usage.anteilig': 'partial',
      'export.csvTitle': 'CSV export', 'export.year': 'Year', 'export.monthOpt': 'Month (optional)', 'export.wholeYear': 'Whole year',
      'export.downloadCsv': 'Download CSV', 'export.fixedSummary': 'Fixed costs summary (CSV)',
      'export.hint': '<strong>Download CSV:</strong> all variable expenses and fixed costs (monthly amortized) for the selected period — one row per fixed cost per month.<br><strong>Fixed costs summary:</strong> each fixed cost <em>once</em>, with monthly and yearly amount, sorted by size — ideal for cleaning up. The reference date is the selected month (current month if none chosen).<br>Both compatible with Excel, LibreOffice Calc and Google Sheets.',
      'export.backupTitle': 'Backup & data', 'export.backupExport': 'Export encrypted backup (.vault)',
      'export.backupRestore': 'Restore backup (.vault)', 'export.changePass': 'Change master password',
      'export.backupHint': 'The <strong>.vault</strong> backup is encrypted with your master password — the only way to move data to another device. After restoring, unlock with the backup\'s password.',
      'modal.expenseAdd': 'Add expense', 'modal.expenseEdit': 'Edit expense',
      'modal.fixedAdd': 'Add fixed cost', 'modal.fixedEdit': 'Edit fixed cost',
      'modal.label': 'Name *', 'modal.amount': 'Amount (€) *', 'modal.date': 'Date', 'modal.category': 'Category',
      'modal.note': 'Note (optional)', 'modal.cancel': 'Cancel', 'modal.save': 'Save',
      'modal.since': 'Since', 'modal.interval': 'Interval', 'modal.monthly': 'Monthly', 'modal.yearly': 'Yearly',
      'modal.usage': 'Tax usage', 'modal.usagePrivat': 'Private', 'modal.usageBetrieblich': 'Business (fully deductible)',
      'modal.usageAnteilig': 'Partial (mixed)', 'modal.active': 'Active (turning off deactivates the entry)',
      'modal.passTitle': 'Change master password', 'modal.passOld': 'Current password',
      'modal.passNew': 'New password (min. 8 chars)', 'modal.passNew2': 'Repeat new password', 'modal.change': 'Change',
      'ph.expName': 'e.g. Supermarket', 'ph.fcName': 'e.g. Netflix, rent, car insurance', 'ph.amount': '0.00',
      'auth.setupTitle': 'Set up vault',
      'auth.setupHint': 'Choose a master password. It encrypts all data locally on the device — without it there is no access and no recovery.',
      'auth.setupPh1': 'Password (min. 8 chars)', 'auth.setupPh2': 'Repeat password', 'auth.setupBtn': 'Create vault',
      'auth.unlockHint': 'Enter your master password to unlock the encrypted data.',
      'auth.unlockPh': 'Master password', 'auth.unlockBtn': 'Unlock', 'auth.unlocking': 'Decrypting…',
      'auth.restore': 'Restore from backup (.vault)',
      'addBtn.title': 'Add expense', 'btn.lock': 'Lock',
      'toast.expSaved': 'Expense saved', 'toast.expUpdated': 'Expense updated', 'toast.deleted': 'Deleted',
      'toast.fcAdded': 'Fixed cost added', 'toast.fcUpdated': 'Fixed cost updated',
      'toast.activated': 'Activated', 'toast.deactivated': 'Deactivated',
      'toast.csv': 'CSV exported', 'toast.fixedSummary': 'Fixed costs summary exported',
      'toast.backupExported': 'Backup exported', 'toast.backupLoaded': 'Backup loaded — please unlock',
      'toast.passChanged': 'Password changed', 'toast.vaultCreated': 'Vault created', 'toast.autolocked': 'Auto-locked',
      'toast.reqFields': 'Name and amount are required', 'toast.passMismatch': 'Passwords do not match',
      'toast.noVault': 'No vault present',
      'confirm.delExpense': 'Delete expense?', 'confirm.delFixed': 'Permanently delete fixed cost entry?',
      'confirm.restore': 'Replace current data with the backup? Then unlock with the backup\'s password.',
      'err.prefix': 'Error: ', 'err.wrongPass': 'Wrong password', 'err.shortPass': 'Password must be at least 8 characters',
    },
  };

  function t(key, vars) {
    let s = (UI[lang] && UI[lang][key] != null) ? UI[lang][key] : (UI.de[key] != null ? UI.de[key] : key);
    if (vars) for (const k in vars) s = s.split('{' + k + '}').join(vars[k]);
    return s;
  }
  function setLang(l) { lang = l; localStorage.setItem(LS, l); document.documentElement.lang = l; }
  function locale() { return lang === 'en' ? 'en-US' : 'de-DE'; }
  function monthName(idx, short) { return new Date(2000, idx, 1).toLocaleString(locale(), { month: short ? 'short' : 'long' }); }

  function applyStatic(root) {
    root = root || document;
    root.querySelectorAll('[data-i18n]').forEach(el => { el.innerHTML = t(el.getAttribute('data-i18n')); });
    root.querySelectorAll('[data-i18n-ph]').forEach(el => { el.setAttribute('placeholder', t(el.getAttribute('data-i18n-ph'))); });
    root.querySelectorAll('[data-i18n-title]').forEach(el => { el.setAttribute('title', t(el.getAttribute('data-i18n-title'))); });
  }

  return { t, setLang, applyStatic, locale, monthName, get lang() { return lang; } };
})();
