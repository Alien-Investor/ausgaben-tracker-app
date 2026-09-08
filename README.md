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
- **Backup:** verschlüsselter `.vault`-Export/-Import zum Geräte-Umzug
- Deutsch & Englisch, in der App umschaltbar
- Dunkles Neon-UI, Mobile-first

Die App ist eine offline-only Web-App (HTML/JS, WebCrypto) in einem Capacitor-Wrapper —
keine externen Dependencies, keine Netzwerk-Calls.

## Install

- **Zap Store** (Nostr App Store): nach *Ausgaben-Tracker* suchen
- Oder die APK aus dem letzten Release sideloaden

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
./build-www.sh && npx cap sync android
# Release-Signierung erfolgt mit einem privaten Keystore (nicht in diesem Repo).
```

## Lizenz

MIT — siehe [LICENSE](LICENSE).
