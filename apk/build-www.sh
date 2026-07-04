#!/usr/bin/env bash
# Bündelt das Web-Frontend (../public) in www/ für die APK.
# Rein lokal/offline: Daten als verschlüsselter Blob in localStorage (WebCrypto).
# Kein Server, kein Konto.
set -euo pipefail
cd "$(dirname "$0")"
rm -rf www && mkdir -p www
cp -r ../public/* www/
rm -f www/migrate.html   # Legacy-Migrationsseite (Server-Ära) gehört nicht in die APK
echo "www/ gebaut:"; ls www/
