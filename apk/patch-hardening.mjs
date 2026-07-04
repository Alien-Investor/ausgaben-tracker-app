// Injiziert die Android-Härtung idempotent in das (regenerierbare) android/-Projekt.
// Läuft in build-apk.sh nach `npx cap sync` — überlebt damit auch ein frisches `npx cap add android`.
//   1) AndroidManifest: allowBackup=false (keine ADB-/Cloud-Backups der Vault-Daten)
//   2) AndroidManifest: INTERNET-Permission ENTFERNEN (App kann nachweisbar nicht funken)
//   3) MainActivity: FLAG_SECURE (kein Screenshot/Recording, keine Recents-Vorschau)
import { readFileSync, writeFileSync } from 'node:fs';

const MANIFEST = 'android/app/src/main/AndroidManifest.xml';
let m = readFileSync(MANIFEST, 'utf8');
const before = m;
m = m.replace(/android:allowBackup="true"/g, 'android:allowBackup="false"');
m = m.replace(/^\s*<uses-permission android:name="android\.permission\.INTERNET"\s*\/>\s*$/gm, '');
if (m !== before) { writeFileSync(MANIFEST, m); console.log('Manifest gehärtet (allowBackup=false, INTERNET entfernt).'); }
else if (!m.includes('allowBackup="false"') || m.includes('android.permission.INTERNET')) {
  console.error('FEHLER: Manifest-Härtung griff nicht — Manifest prüfen!'); process.exit(1);
} else console.log('Manifest bereits gehärtet.');

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
