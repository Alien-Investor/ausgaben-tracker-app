#!/usr/bin/env bash
# Bündelt das Web-Frontend (../public) in www/ für die APK.
# Rein lokal/offline: Daten als verschlüsselter Blob in localStorage (WebCrypto).
# Kein Server, kein Konto.
set -euo pipefail
cd "$(dirname "$0")"
rm -rf www && mkdir -p www
cp -r ../public/* www/
rm -f www/migrate.html   # Legacy-Migrationsseite (Server-Ära) gehört nicht in die APK
# Versionsanzeige (Einstellungen) aus VERSION setzen — einzige Quelle, wie bei Sachwert-Tresor und Alien Pass.
# public/app.js bleibt unangetastet; check-version.mjs im Repo-Root prüft, dass beide übereinstimmen.
VNAME=$(grep '^VERSION_NAME=' VERSION | cut -d= -f2 | tr -d '[:space:]')
[ -n "$VNAME" ] || { echo "FEHLER: VERSION_NAME fehlt in VERSION"; exit 1; }
sed -i -E "s|^const APP_VERSION = '[^']*';|const APP_VERSION = '$VNAME';|" www/app.js
grep -q "^const APP_VERSION = '$VNAME';" www/app.js || { echo "FEHLER: APP_VERSION konnte nicht auf $VNAME gesetzt werden"; exit 1; }
echo "APP_VERSION = $VNAME"
echo "www/ gebaut:"; ls www/
