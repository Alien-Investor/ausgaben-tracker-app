// Injiziert die Android-Härtung idempotent in das (regenerierbare) android/-Projekt.
// Läuft in build-apk.sh nach `npx cap sync` — überlebt damit auch ein frisches `npx cap add android`.
//   1) AndroidManifest: allowBackup=false (keine ADB-/Cloud-Backups der Vault-Daten)
//   2) AndroidManifest: INTERNET-Permission ENTFERNEN (App kann nachweisbar nicht funken)
//   3) MainActivity: FLAG_SECURE (kein Screenshot/Recording, keine Recents-Vorschau)
// Die Prüfung am Ende läuft UNBEDINGT (Audit run-1 #13: vorher meldete das Skript Erfolg, sobald irgendetwas
// ersetzt wurde — eine INTERNET-Zeile in anderer Schreibweise blieb dann stehen). Aufruf mit --check <manifest>
// prüft nur (für den zusammengeführten Manifest nach dem Gradle-Build, siehe build-apk.sh).
import { readFileSync, writeFileSync } from 'node:fs';

const INTERNET_RE = /<uses-permission\b[^>]*android\.permission\.INTERNET[^>]*(\/>|>\s*<\/uses-permission>)/g;
function assertHardened(m, label) {
  const problems = [];
  if (!/android:allowBackup="false"/.test(m)) problems.push('allowBackup ist nicht "false"');
  if (/android\.permission\.INTERNET/.test(m)) problems.push('INTERNET-Permission vorhanden');
  if (problems.length) {
    console.error(`FEHLER: Manifest-Härtung unvollständig (${label}): ${problems.join(', ')} — Build abgebrochen!`);
    process.exit(1);
  }
  console.log(`Manifest geprüft (${label}): allowBackup=false, keine INTERNET-Permission.`);
}

if (process.argv[2] === '--check') {
  assertHardened(readFileSync(process.argv[3], 'utf8'), process.argv[3]);
  process.exit(0);
}

const MANIFEST = 'android/app/src/main/AndroidManifest.xml';
let m = readFileSync(MANIFEST, 'utf8');
const before = m;
m = m.replace(/android:allowBackup="true"/g, 'android:allowBackup="false"');
m = m.replace(INTERNET_RE, '');
if (m !== before) { writeFileSync(MANIFEST, m); console.log('Manifest gehärtet (allowBackup=false, INTERNET entfernt).'); }
else console.log('Manifest bereits gehärtet.');
assertHardened(m, MANIFEST);

const MAIN = 'android/app/src/main/java/org/alieninvestor/ausgaben/MainActivity.java';
let j = readFileSync(MAIN, 'utf8');
if (!j.includes('FLAG_SECURE')) {
  j = `package org.alieninvestor.ausgaben;

import android.os.Bundle;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Kein Screenshot/Screen-Recording, keine Vorschau im App-Switcher (Recents)
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
    }
}
`;
  writeFileSync(MAIN, j);
  console.log('MainActivity: FLAG_SECURE injiziert.');
} else console.log('MainActivity bereits gehärtet (FLAG_SECURE).');
