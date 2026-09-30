# Ausgaben-Tracker — Android Client

Ein minimalistischer, **vollständig offline** laufender Ausgaben-Tracker, verpackt als
native Android-App (Capacitor). Kein Konto, kein Server, kein Tracking — alle Daten
bleiben **verschlüsselt auf deinem Gerät** und verlassen es nie.

A minimal, fully **offline** personal expense tracker, packaged as a native Android app.
No account, no server, no tracking — all data stays **encrypted on your device**.

## Features

- Monatsübersicht mit Fixkosten, variablen Ausgaben und Vergleich zum Vormonat
- Jahresübersicht (12-Monats-Tabelle)
- Fixkosten-Verwaltung (monatlich/jährlich, historisch korrekt über Aktiv-/Inaktiv-Status)
- CSV-Export (Excel/LibreOffice/Sheets-kompatibel) inkl. Fixkosten-Zusammenfassung
- Steuerliche Nutzung pro Fixkosten-Position (privat / betrieblich / anteilig)
- **Schulden / Verbindlichkeiten** (seit v1.6): offene Zahlungen mit Betrag, Fälligkeit und
  Notiz notieren und abhaken, überfällige Posten rot markiert — auf Wunsch beim Abhaken
  direkt als Ausgabe buchen
- **Verschlüsselter Tresor:** Master-Passwort, AES-256-GCM, Schlüssel via PBKDF2-SHA256
  (600.000 Iterationen), Auto-Lock nach Inaktivität
- **Backup:** verschlüsselter `.vault`-Export/-Import zum Geräte-Umzug — beim Import fragt die App
  nach dem Passwort des Backups und ersetzt die vorhandenen Daten erst, wenn es sich öffnen lässt
- **Einstellungen** (seit v1.7): Auto-Lock wählbar (Aus / 1 / 5 / 15 / 30 Minuten), Jetzt sperren,
  Master-Passwort ändern, Farbschema Schwarz (Neon) / Soft (Marine), eigene Kategorien anlegen,
  umbenennen und löschen, Versionsanzeige
- **Übersicht nach Kategorie** mit Suche und Kategorie-Filter (seit v1.7)
- Eingebautes Handbuch (?-Knopf), Deutsch & Englisch — folgt beim ersten Start der Systemsprache,
  in der App umschaltbar
- Familien-Design der Alien-Investor-Apps (Orbitron / Share Tech Mono, lokal gebündelt), Mobile-first —
  Auswahlfelder und Such-X im App-Design statt grauer Systemlisten (seit v1.8)
- **Rückfragen im App-Design** (seit v1.9): „Löschen?“ erscheint als eigener Dialog statt als Android-Systemdialog —
  der Systemdialog unterlag nicht dem Screenshot-Schutz der App. Dazu **„Rückgängig“** nach dem Löschen einer Ausgabe
  (sechs Sekunden, Eintrag kommt unverändert zurück)

Die App ist eine offline-only Web-App (HTML/JS, WebCrypto) in einem Capacitor-Wrapper —
keine externen Dependencies, keine Netzwerk-Calls.

## Install

Bewusst **nicht bei Google Play**. Signierte Releases gibt es auf der eigenen Download-Adresse
[api.alien-investor.org/downloads/ausgaben-tracker/](https://api.alien-investor.org/downloads/ausgaben-tracker/) und im
[Zap Store](https://zapstore.dev/apps/org.alieninvestor.ausgaben) (Nostr App Store). Jedes Release liegt zusätzlich als Spiegel auf
[GitHub](https://github.com/Alien-Investor/ausgaben-tracker-app/releases).

**[Obtainium](https://github.com/ImranR98/Obtainium)** (automatische Updates, ohne Google) — in Obtainium **„App hinzufügen“** antippen:

1. „Quell-URL der App“:
   ```
   https://api.alien-investor.org/downloads/ausgaben-tracker/
   ```
2. Unter „Zusatzoptionen für HTML“, „Versionsextraktion per RegEx“:
   ```
   ausgaben-tracker-([0-9]+(\.[0-9]+)+)\.apk$
   ```
3. „Zu verwendende Gruppe abgleichen“: `$1`
4. „Expected signing certificate hashes“ (so heißt es auch in der deutschen Obtainium-Fassung):
   ```
   DB:C5:08:71:53:B4:59:21:82:DD:13:1A:73:0C:11:A0:F7:12:4E:34:42:6C:54:2B:4B:A6:88:5A:B1:CC:01:0E
   ```
5. Mit **„+“** hinzufügen → **Installieren**. Obtainium meldet Updates danach automatisch.

Die RegEx braucht Obtainium, um auf einer Download-Seite die Versionsnummer aus dem Dateinamen zu lesen; ohne sie kann es nicht
mit der installierten Version vergleichen. Der Zertifikats-Hash ist eine harte Sperre: Eine APK mit anderem Signaturschlüssel installiert Obtainium gar nicht.
Werte zum Kopieren, oder mit „In Obtainium öffnen“ (alles vorbelegt): [Obtainium-Blatt auf der Website](https://alien-investor.org/apps.html#obtainium-ausgaben).

> **Noch mit der Codeberg-Adresse eingerichtet?** Dort erscheinen keine Releases mehr. Obtainium kann die Quelle einer App nicht ändern, deshalb einmalig:
> vorher im Tab „Export“ ein verschlüsseltes `.vault`-Backup anlegen, den Eintrag „Ausgaben-Tracker“ entfernen und im Dialog nur **„Aus Obtainium entfernen“**
> eingeschaltet lassen (**„Vom Gerät deinstallieren“ aus** — das löscht App und Daten), dann wie oben neu hinzufügen.
> Obtainium erkennt die installierte App, Signatur und Paket-ID bleiben gleich.

**Ohne Obtainium:** [Download-Seite](https://api.alien-investor.org/downloads/ausgaben-tracker/) → `.apk` laden und installieren.

**Signatur-Fingerprint** — zum Prüfen der Echtheit, über alle Versionen gleich.
Derselbe Wert, zwei Schreibweisen — beides ist der SHA-256 des Signatur-Zertifikats:

```
AppVerifier (mit Doppelpunkten, so zeigt die App es dir an):
DB:C5:08:71:53:B4:59:21:82:DD:13:1A:73:0C:11:A0:F7:12:4E:34:42:6C:54:2B:4B:A6:88:5A:B1:CC:01:0E

Plain SHA-256 (apksigner / ohne Trennzeichen):
dbc5087153b4592182dd131a730c11a0f7124e34426c542b4ba6885ab1cc010e
```

Mit [AppVerifier](https://github.com/soupslurpr/AppVerifier) die installierte App öffnen
und mit dem Doppelpunkt-Wert oben vergleichen.

## Sicherheit

Alle Daten werden mit deinem Master-Passwort verschlüsselt (AES-256-GCM, PBKDF2-SHA256,
600.000 Iterationen, native WebCrypto). Ohne das Passwort gibt es keinen Zugriff und
keine Wiederherstellung — es wird nirgends gespeichert oder übertragen.

## Build

```bash
cd apk
npm install
npx cap add android          # einmalig
./build-www.sh               # kopiert ../public nach www/ und setzt die Versionsanzeige aus VERSION
npx cap sync android
node patch-hardening.mjs     # allowBackup=false, INTERNET-Permission raus, FLAG_SECURE, Autofill-Ausschluss — bricht ab, wenn etwas fehlt
( cd android && ./gradlew assembleRelease --no-daemon )
node patch-hardening.mjs --check android/app/build/intermediates/packaged_manifests/release/AndroidManifest.xml
# Release-Signierung erfolgt mit einem privaten Keystore (nicht in diesem Repo). Ohne Signierkonfiguration
# baut Gradle eine unsignierte APK; die Härtung (keine Permissions) ist unabhängig davon und prüfbar.
```

Sicherheits-Audits: v1.5 (internes Audit), **v1.7 run-1 (13.09.2026)** mit dem security-audit-Skill —
13 Funde, alle vor dem Release behoben; Nachbesserung zu Fund 6 in **v1.7.1**. **v1.7.2** behebt einen Querfund aus dem Review des
Sachwert-Tresors: Passwortwechsel und gleichzeitiges Speichern; **v1.9** ersetzt die Android-Systemdialoge durch eigene Rückfragen,
weil der Systemdialog nicht unter dem Screenshot-Schutz (FLAG_SECURE) lag; **v1.10** nimmt die WebView vom Android-Autofill-Framework aus, damit ein fremder Passwort-Manager als Autofill-Dienst die Passphrase-Felder nicht sieht und nicht anbieten kann, sie zu speichern (Details im `CHANGELOG.md`).

## Lizenz

MIT — siehe [LICENSE](LICENSE).
