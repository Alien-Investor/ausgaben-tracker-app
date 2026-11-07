# Changelog — Ausgaben-Tracker

Format: `## vX.Y — YYYY-MM-DD`. Offline-App (Capacitor), Web + APK aus einer Codebasis.

## v1.12 — 2026-11-07

Funktionsrelease mit **neuem Datenformat (Tresor-Version 2)**. Backups aus allen bisherigen Versionen laden weiter. Ein Backup, das
Einnahmen enthält, gehört aber nur in v1.12 oder neuer: v1.11 und älter kennen Einnahmen nicht, würden sie als Ausgaben zeigen und die
Unterscheidung beim nächsten Speichern verlieren.

- **Einnahmen.** Im Formular (Plus-Knopf) oben zwischen „Ausgabe“ und „Einnahme“ umschalten. Erfasst werden einmalige Einnahmen wie
  Gehalt, Nebeneinkünfte oder Erstattungen. Beträge bleiben positiv, die Art bestimmt die Richtung. Einnahmen haben eigene Kategorien
  (Standard: Gehalt, Nebeneinkünfte, Erstattungen, Sonstige Einnahmen), die du in den Einstellungen getrennt von den Ausgaben-Kategorien
  verwaltest. Bestehende Tresore bekommen die Standardliste beim ersten Entsperren.
- **Bilanz nur bei Bedarf.** Solange der Tresor keine Einnahme enthält, sieht alles aus wie bisher. Ab der ersten Einnahme zeigt die
  Übersicht oben eine Bilanz-Karte (Einnahmen, Ausgaben, Saldo, Sparquote) und unter den variablen Ausgaben einen Abschnitt „Einnahmen“.
  Der Jahr-Tab bekommt eine eigene Bilanz-Tabelle mit dem Saldo je Monat und der Sparquote. Im laufenden Jahr rechnet sie bis heute,
  künftige Monate bleiben leer. Gesamt, Vormonatsvergleich und „Nach Kategorie“ zählen weiterhin nur Ausgaben.
- Suche und Kategorie-Chips filtern auch Einnahmen, Löschen mit „Rückgängig“ funktioniert wie bei Ausgaben. „Abhaken + als Ausgabe
  buchen“ im Tab „Schulden“ bucht immer eine Ausgabe.
- **CSV-Export:** neue Spalte „Art“ (Ausgabe/Einnahme) direkt nach dem Betrag. Wer eine Tabelle mit festen Spaltenpositionen nutzt:
  „Typ“ und „Notiz“ rücken eine Spalte nach rechts.
- **Schutz vor Backups aus neueren Versionen:** Ein Backup aus einer künftigen Version mit neuem Datenformat lehnt die App mit dem
  Hinweis „Bitte die App aktualisieren“ ab, statt unbekannte Felder still zu verwerfen.
- **Zahlenfelder im Neon-Look:** Die Pfeile im Betragsfeld und das Kalender-Symbol im Datumsfeld folgen dem App-Design statt des grauen
  Browser-Standards (sichtbar im Desktop-Browser; am Handy öffnet das Datumsfeld weiter den Android-Datumsdialog).
- **Neues App-Symbol:** eigener Alien-Kopf im Neon-Look (ohne Mund) statt der bisherigen Vorlage aus Twemoji, die Euro-Münze bleibt.
- Enter im Feld „Neue Kategorie“ legt die Kategorie an.
- **Monatswechsel bei laufender App:** Blieb die App über einen Monatswechsel geöffnet, blieben Übersicht und Jahr im alten Monat stehen,
  und der neue Monat war bis zum nächsten Neustart nicht erreichbar. Jetzt rückt die Ansicht beim Entsperren und bei der Rückkehr in die App
  in den neuen Monat vor, wenn sie auf dem bisher laufenden Monat stand. Ein bewusst gewählter anderer Monat bleibt stehen.
- **Kleinere Korrekturen:** Wurden zwei Kategorien gleichzeitig zum Umbenennen geöffnet, konnte der neue Name bei der falschen landen.
  Ein abgelehnter Betrag beim Bearbeiten ließ den geänderten Namen bis zum nächsten Speichern im Speicher stehen. Öffnete sich das
  Backup-Passwortfenster in den ersten Sekundenbruchteilen nach dem Sperrbildschirm, sprang der Eingabefokus in das Feld dahinter.
  Wurde die Uhr des Telefons zurückgestellt, während die App entsperrt im Hintergrund lag, sperrte sie beim Öffnen nicht; jetzt sperrt sie.
  Der Dateiname des Backups trägt das Ortsdatum (vorher UTC, kurz nach Mitternacht stand dort noch der Vortag).

## v1.11 — 2026-10-04

Wartungsrelease. Keine Änderung am Datenformat; Backups aus allen bisherigen Versionen laden unverändert.

- **Backup-Datei geht bei der Auto-Sperre nicht mehr verloren.** Die Dateiauswahl ist unter Android eine eigene App. Lief
  währenddessen die Auto-Sperre ab, kam die gewählte Backup-Datei in eine gesperrte App und wurde verworfen. Jetzt merkt sich die
  App nur, welche Datei gewählt wurde (gelesen wird sie erst nach dem Entsperren). Der Sperrbildschirm zeigt „Datei gewählt — zum
  Wiederherstellen entsperren“. Entsperrst du innerhalb von fünf Minuten, läuft die Wiederherstellung mit genau dieser Datei weiter
  (es folgt das Passwort des Backups); später meldet die App „Dateiwahl verfallen“. Das gilt auch, wenn die Datei gerade gelesen
  wurde oder das Passwortfenster schon offen war. Die Sperre selbst greift wie bisher. Wiederherstellen direkt vom Sperrbildschirm aus
  funktioniert unverändert.
- **Lesefehler werden gemeldet.** Ließ sich eine gewählte Datei nicht lesen (z. B. weil sie nach der Auswahl ersetzt wurde), passierte
  bisher nichts. Jetzt erscheint „Datei konnte nicht gelesen werden — bitte erneut wählen.“
- **Intern angeglichen an die Schwester-Apps (unter Android ohne sichtbare Änderung):** Auge im Passwortfeld behält beim Aufdecken
  die Cursorposition und hebt eine Markierung auf, Scrollbalken im Neon-Look bei Bedienung mit der Maus. Beides wirkt nur, wenn der
  Code im Desktop-Browser läuft (lokaler Test); eine Browser-Version des Trackers gibt es seit Juni 2026 nicht mehr.
- **Handbuch:** Der Quellcode liegt auf GitHub (`Alien-Investor/ausgaben-tracker-app`), nicht mehr auf Codeberg.
- **Android:** Capacitor 6.2.1 → 6.2.2. Die Version sperrt einen internen Proxy-Pfad der Brücke gegen fremde Inhalte. Die App hat keine
  Internet-Berechtigung, ist also kaum betroffen; das Update wird trotzdem mitgenommen.

## v1.10.1 — 2026-09-26

- **Android — Absturz verhindert (internes Diff-Review, Querfund Alien Pass v1.15):** Seit v1.10 bekommt die WebView keinen
  Autofill-Dienst. Eine andere App konnte den Ausgaben-Tracker mit bestimmten Zusatzangaben starten, und Android stürzte dann beim
  Schließen der App ab (keine Daten betroffen). Die App entfernt diese Angaben jetzt beim Start.

## v1.10 — 2026-09-26

Härtung ohne Änderung an Oberfläche, Datenformat oder Daten (Querfund aus Alien Pass v1.12/v1.13).
- **Neu — Android:** Die App nimmt ihre Felder vom Android-Autofill-Framework aus. Bisher meldete die WebView jedes Passwortfeld an den
  systemweiten Autofill-Dienst — ist dort ein Passwort-Manager eingerichtet, bot er sich in den Passphrase-Feldern an und konnte anbieten,
  die Passphrase zu speichern. Das Attribut `autocomplete="off"` im HTML hält das nicht auf, und die Android-Markierung „nicht wichtig für
  Autofill“ beachtet die WebView ebenfalls nicht. Darum bekommt die WebView jetzt gar keinen Zugang zum Autofill-Dienst (wenige Zeilen in der
  MainActivity, Quelltext wie bisher in `apk/patch-hardening.mjs`, das den Ausschluss im erzeugten Java prüft).

## v1.9 — 2026-09-26

Sicherheits- und Darstellungs-Update, Querfund aus Alien Notes. Keine Änderung am Datenformat; Backups aus v1.7.x und v1.8.x laden unverändert.

- **Rückfragen im App-Design statt Android-Systemdialog.** „Ausgabe löschen?“, „Fixkosten-Eintrag dauerhaft löschen?“,
  „Verbindlichkeit dauerhaft löschen?“ und „Kategorie löschen?“ erscheinen jetzt als eigener Dialog in den Farben der App.
  Grund: Der Systemdialog unterlag nicht dem Screenshot-Schutz der App — ein Screenshot bei offener Rückfrage konnte den
  Dialogtext zeigen, während die App dahinter schwarz war. Jede Frage hat den passenden Knopf („Löschen“, „Endgültig löschen“,
  „Kategorie löschen“, rot), „Abbrechen“ ist die sichere Vorgabe; ESC und ein Tipp daneben brechen ab. Die Löschnachfrage zur
  Ausgabe nennt Name und Betrag. Wird die App während einer offenen Frage gesperrt, verfällt die Frage.
- **„Rückgängig“ nach dem Löschen einer Ausgabe.** Sechs Sekunden lang bietet die Meldung „Gelöscht“ einen Knopf, der die
  Ausgabe unverändert (gleiche ID, gleiche Stelle) zurückholt. Fixkosten, Verbindlichkeiten und Kategorien bleiben endgültig
  (dort steht die Rückfrage). Beim Sperren verschwindet die Meldung samt Knopf.
- **Auge im Passwortfeld und Kästchen im App-Design:** Das Auge ist jetzt ein Symbol in Theme-Farbe (durchgestrichen bei
  sichtbarem Passwort) und schließt sich beim Sperren und nach einem Fehlversuch; das Kästchen „Aktiv“ bei den Fixkosten ist
  nicht mehr das weiße Systemkästchen.
- Neue Prüfsuite `verify-dialog.mjs` (42 Prüfungen: kein `confirm()` mehr, Dialog, Tastatur, Sperre, Rückgängig, Säuberung der
  Wiederherstellung, Auge, Kästchen, EN, Passung 360 px); die sechs bestehenden Suiten laufen über den Dialog-Hook `test-dialog.mjs`.

## v1.8.1 — 2026-09-21

Reine Darstellungskorrektur. Am Datenformat, an der Verschlüsselung und an deinen Daten ändert sich nichts.

- **Passwortfeld bleibt dunkel, wenn ein Passwortmanager es ausfüllt.** Füllte ein Passwortmanager (z.B. Proton Pass)
  das Master-Passwort per Autofill ein, legte das System ein helles Feld darüber. Das Feld behält jetzt Hintergrund und
  Schriftfarbe der gewählten Darstellung.

## v1.8 — 2026-09-16

Oberflächen-Update nach dem Vorbild von Alien Pass v1.5. Keine neuen Funktionen, keine Änderung am Datenformat;
Backups aus v1.7.x laden unverändert.

- **Auswahlfelder im App-Design:** Kategorie, steuerliche Nutzung, Auto-Lock sowie Jahr und Monat im Export klappen
  nicht mehr als graue Systemliste auf, sondern als Menü in den Farben der App (folgt dem Theme Schwarz oder Soft).
  Die aktuelle Wahl ist markiert. Tippen daneben oder ESC schließt nur das Menü, ein offenes Formular bleibt offen.
- **Such-X:** Das Löschen-Kreuz im Suchfeld der Übersicht ist jetzt neon statt blau.
- Datumsfelder öffnen weiter den Datumsdialog des Systems (Bedienung und Datumsformat des Geräts).
- Beim Sperren werden offene Menüs geschlossen und geleert, damit keine Kategorienamen in der Anzeige bleiben.
- Neue Prüfsuite `verify-v18.mjs` (Aufbau, Wählen, Sprachwechsel, ESC/Außenklick, böse Kategorienamen, Sperren).

## v1.7.2 — 2026-09-14

Wartungsrelease, Querfund aus dem Review des Sachwert-Tresors (v2.9.1). Keine neuen Funktionen, keine Änderung
am Datenformat; Backups aus v1.7.x laden unverändert.

- **Passwort ändern:** Während der Schlüsselableitung (knapp eine Sekunde) konnte ein gleichzeitiges Speichern,
  etwa eine geänderte Einstellung, den Tresor mit dem alten Schlüssel, aber schon dem neuen Salt ablegen. Brach
  der Wechsel danach ab (Sperren, App beendet, Speicherfehler), öffnete **kein Passwort** den Tresor mehr, nur ein
  Backup half. Jetzt wird der neue Schlüssel erst vollständig abgeleitet und dann in einem Schritt übernommen.
  Ein überholtes Speichern schreibt mit dem neuen Schlüssel nach, statt „Tresor gesperrt“ zu melden.
- Scheitert das Speichern beim Passwortwechsel, gilt im laufenden Betrieb wieder das bisherige Passwort, passend
  zum gespeicherten Tresor. Wird während des Wechsels gesperrt, bleibt der neue Schlüssel verworfen.
- Neue Prüfsuite `verify-v172.mjs` (überholtes Speichern, Speichern + Sperren während der Ableitung, Speicherfehler).

## v1.7.1 — 2026-09-13

Wartungsrelease, Nachbesserung zu Audit-Fund 6 aus run-1. Keine neuen Funktionen, keine Änderung am
Datenformat; ein Backup aus v1.7 lädt unverändert.

- **Inaktive Fixkosten ohne Datum:** Beim Import eines Backups bekamen deaktivierte Fixkosten, die kein
  gültiges Deaktivierungsdatum trugen, bisher das heutige Datum eingesetzt. Dadurch zählten sie in allen
  **Vormonaten** weiterhin mit (Übersicht, Fixkosten-Summe, CSV). Jetzt bleibt das Datum leer, und der
  Posten zählt in keinem Monat. Wer einen Posten in der App selbst deaktiviert, behält wie bisher das
  Datum des Klicks; nur ab diesem Monat fällt er weg.
- Prüfsuite `verify-audit1.mjs` #6 misst das jetzt über mehrere Monate hinweg (aktueller Monat, Vorjahr, Altmonate).

## v1.7 — 2026-09-13

Der Tracker sieht jetzt aus wie seine Schwester-Apps (Sachwert-Tresor, Alien Pass) und bekommt einen
Tab **Einstellungen**. Bestehende Tresore und Backups funktionieren unverändert; ein Backup aus v1.6.1
lädt sauber (Kategorien bekommen intern eine ID, Einstellungen starten mit den Standardwerten).

- **Design:** Familien-Look mit Orbitron + Share Tech Mono (lokal gebündelt, keine Netzlast), flache
  Neon-Karten, Tabs oben, Sperr- und Setup-Screen als Karte unter dem Kopf. Sternenhimmel jetzt
  statisch (kein Twinkle, kein Nebel, keine Sternschnuppen — spart Akku, respektiert reduced-motion).
  Zweites Farbschema **Soft (Marine)**, Wahl gilt markenweit für alle Alien-Investor-Apps.
- **Einstellungen (neuer Tab):** Auto-Lock wählbar (Aus / 1 / 5 / 15 / 30 Minuten, wandert mit dem
  Backup), „Jetzt sperren", Master-Passwort ändern (aus dem Export-Tab hierher gezogen), Darstellung,
  Kategorien verwalten, Über-Karte mit **Versionsnummer**.
- **Kategorien:** eigene Kategorien anlegen, umbenennen (zieht alle Einträge nach) und löschen
  (Einträge wandern nach „Sonstiges"). Neue Karte **Nach Kategorie** in der Übersicht mit Summe,
  Balken und Anteil je Kategorie für den Monat.
- **Suche + Filter:** Suchfeld (Name, Notiz, Kategorie; Umlaute und Groß-/Kleinschreibung egal) und
  Kategorie-Chips über den Listen der Übersicht.
- **Handbuch:** ?-Knopf im Kopf öffnet eine kurze Anleitung (DE/EN) zu Erfassen, Fixkosten, Schulden,
  Export, Backup und Sicherheit.
- **Sprache:** Beim ersten Start folgt die App der Systemsprache (Deutsch oder Englisch); der
  Sprach-Knopf zeigt die aktive Sprache. Standard-Kategorien werden in der aktiven Sprache angelegt.
  `?lang=de|en` erzwingt eine Sprache (für Screenshots).
- **Bedienung:** ESC schließt Formulare und Handbuch, Fokus kehrt zum Auslöser zurück, sichtbarer
  Tastaturfokus, Dialoge mit `role="dialog"`.
- **Sicherheit:** Inline-Script ist per Content-Security-Policy verboten (`script-src 'self'` ohne
  `unsafe-inline`); alle Klick-Handler laufen über eine Aktions-Liste in `app.js`. Escaping deckt
  jetzt auch Attribut-Kontexte ab. Backup-Import prüft zusätzlich Kategorie-IDs, Dubletten und die
  Einstellungen. Fehlermeldungen sind vollständig übersetzt.
- **Intern:** CSS und JS aus `index.html` in `app.css` / `app.js` ausgelagert; Versionsnummer wird
  beim Bauen aus `apk/VERSION` gesetzt und im Test gegengeprüft.

**Security-Audit run-1 (13.09.2026, vor dem Release):** 13 Funde, alle behoben und als Regressionstests
festgehalten. Was sich für Nutzer ändert:

- **Backup wiederherstellen ist jetzt gefahrlos:** Die App fragt nach dem Passwort des Backups und ersetzt
  die vorhandenen Daten erst, wenn sich das Backup öffnen lässt. Vorher überschrieb eine unbrauchbare oder
  falsche Datei die einzige Kopie des Tresors (der Fund mit der höchsten Bewertung).
- **Leeres „Seit"-Datum bleibt leer:** Ein Fixkosten-Eintrag ohne Startdatum gilt für alle Monate. Vorher
  wurde das Feld bei jeder Bearbeitung still auf „heute" gesetzt, und die Position verschwand aus allen
  früheren Monaten, Jahresansichten und der Steuer-CSV.
- **Zeitzonen:** Monatszuordnung und „heute" laufen jetzt in Ortszeit. Vorher rutschten in Amerika
  Ausgaben vom 1. eines Monats in den Vormonat, und in Europa bekam eine Eingabe zwischen 0 und 2 Uhr das
  Datum von gestern.
- **Backup-Import strenger:** doppelte IDs, inaktive Fixkosten ohne Datum, ungültige Kalenderdaten und
  Nicht-Zahlen bei Auto-Lock werden korrigiert statt übernommen; Eingaben in Formularen werden genauso
  geprüft wie beim Import. Verwaiste Kategorien bleiben beim Bearbeiten erhalten; der Löschdialog nennt
  die Kategorie, in die Einträge tatsächlich wandern.
- **Auto-Lock** startet direkt nach dem Entsperren mit dem eingestellten Wert (vorher einmalig 5 Minuten).
- **Build:** Codeberg-Token nie mehr in der Prozessliste; die Manifest-Prüfung (keine INTERNET-Permission,
  kein Backup) bricht den Build jetzt unbedingt ab und prüft auch den zusammengeführten Manifest.

## v1.6.1 — 2026-09-08

Kleines Folge-Release zu v1.6 nach einem gezielten Sicherheits-Review des neuen Codes
(Ergebnis: keine ausnutzbare Lücke, vier Kleinigkeiten behoben) plus ein Darstellungsfehler.

- **Navigation:** Auf Geräten mit 401 bis 480 px Breite (z.B. Pixel-Reihe mit 412 px) wurde
  der Tab „Export" mit den deutschen Tab-Namen abgeschnitten. Der engere Tab-Abstand greift
  jetzt bis 480 px; geprüft in beiden Sprachen von 320 bis 720 px.
- **Abhaken + als Ausgabe buchen:** Die Verknüpfung zur Verbindlichkeit wird vor dem Speichern
  fixiert, ein Overlay-Klick im falschen Moment kann keinen anderen Posten mehr abhaken.
- **Datum immer aktuell:** Fälligkeits- und Überfällig-Anzeige nutzen das echte Tagesdatum,
  auch wenn die App tagelang offen bleibt (vorher: Datum vom App-Start).
- **CSV-Export:** Formel-Schutz zusätzlich für `-` sowie Tab/CR am Zellanfang.
- **Sperren:** Rot-Markierung der Summe wird beim Sperren ebenfalls zurückgesetzt.

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
