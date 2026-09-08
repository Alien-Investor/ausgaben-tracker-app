# Changelog — Ausgaben-Tracker

Format: `## vX.Y — YYYY-MM-DD`. Offline-App (Capacitor), Web + APK aus einer Codebasis.

## v1.6 — 2026-09-08

Neuer Tab **Schulden** (Verbindlichkeiten): offene Zahlungen sicher im verschlüsselten
Tresor notieren und abhaken. Bestehende Vaults und Backups funktionieren unverändert;
ein Backup aus v1.6 enthält die Verbindlichkeiten automatisch mit.

- **Verbindlichkeiten anlegen:** Bezeichnung, Betrag, optionales Fälligkeitsdatum, Notiz.
- **Abhaken / wieder öffnen:** Erledigte Posten rutschen durchgestrichen in den Bereich
  „Erledigt" (mit Datum), lassen sich wieder öffnen oder dauerhaft löschen.
- **Kopfzeile:** Summe aller offenen Verbindlichkeiten, Anzahl offen/überfällig.
  Überfällige Posten werden rot markiert, Fälligkeit in den nächsten 7 Tagen orange.
- **Abhaken + als Ausgabe buchen:** öffnet das Ausgaben-Modal vorbefüllt (Kategorie
  frei wählbar); nach dem Speichern ist die Verbindlichkeit abgehakt und die Zahlung
  erscheint in der Monatsübersicht. Normales Abhaken bucht keine Ausgabe.
- **Sicherheit:** Verbindlichkeiten laufen beim Backup-Import durch dieselbe
  Schema-Prüfung wie Ausgaben (Feld-Whitelist, strikt numerische Beträge, UUID-IDs,
  Datumsfelder gekappt, `done` strikt boolean); Sperren räumt auch diesen Tab und
  das Modal aus dem DOM. Keine neuen Permissions, CSP unverändert.
- Navigation auf schmalen Displays (360 px) enger gesetzt, damit fünf Tabs passen.

## v1.5 — 2026-07-04

Sicherheits-Release: Härtung nach internem Code-Audit (gleiche Linie wie
Sachwert-Tresor v2.0). Keine Pflichtschritte für Nutzer — bestehende Vaults,
Backups und Passwörter funktionieren unverändert.

- **Android — keine INTERNET-Permission mehr:** Die App fordert keine einzige
  Berechtigung an; dass sie nicht funken kann, erzwingt das OS und ist im
  Manifest der APK nachprüfbar.
- **Android — FLAG_SECURE:** keine Screenshots, kein Screen-Recording, keine
  Vorschau der Ausgaben im App-Switcher.
- **Android — allowBackup=false:** Vault-Daten landen in keinem ADB-/Cloud-Backup.
- **Content-Security-Policy** mit `connect-src 'none'`: keinerlei Netz-Verbindung
  möglich — Exfiltration selbst bei einem hypothetischen Script-Fund ausgeschlossen.
- **Backup-Import gehärtet:** Wiederhergestellte `.vault`-Dateien werden beim
  Entsperren schema-validiert (nur bekannte Felder, geprüfte Typen, gekappte
  Textlängen, Beträge strikt numerisch, IDs auf UUID-Zeichen). Ein präpariertes
  Backup kann keinen Code mehr in die App schmuggeln; IDs in onclick-Handlern
  werden zusätzlich attribut-sicher gefiltert.
- **Sperren räumt auf:** Beim manuellen wie automatischen Sperren werden alle
  gerenderten Ausgaben, Fixkosten und Formularfelder aus dem DOM entfernt.
- **Auto-Lock nach Backgrounding:** Kehrt man nach über 5 Minuten zur App zurück,
  wird die verstrichene Zeit geprüft und sofort gesperrt (Timer kann in
  eingefrorener WebView pausieren).
- **CSV-Export:** Formel-Injection neutralisiert (`=`, `+`, `@` am Zellanfang).
- **Legacy `migrate.html`** wird nicht mehr in die APK gebündelt.
