// Injiziert die Android-Härtung idempotent in das (regenerierbare) android/-Projekt.
// Läuft in build-apk.sh nach `npx cap sync` — überlebt damit auch ein frisches `npx cap add android`.
//   1) AndroidManifest: allowBackup=false (keine ADB-/Cloud-Backups der Vault-Daten)
//   2) AndroidManifest: INTERNET-Permission ENTFERNEN (App kann nachweisbar nicht funken)
//   3) MainActivity: FLAG_SECURE (kein Screenshot/Recording, keine Recents-Vorschau) + WebView vom Android-Autofill-Framework
//      ausgenommen (v1.10: ein fremder Passwort-Manager als Autofill-Dienst sieht die Passphrase-Felder sonst und bietet an, sie zu speichern)
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

// MainActivity: Quelltext wird bei jeder Abweichung komplett neu geschrieben (nicht nur, wenn FLAG_SECURE fehlt — sonst bliebe eine
// alte Fassung ohne den Autofill-Ausschluss stehen), danach werden beide Härtungen im erzeugten Java geprüft.
const MAIN = 'android/app/src/main/java/org/alieninvestor/ausgaben/MainActivity.java';
const MAIN_SRC = `package org.alieninvestor.ausgaben;

import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    // Kein Android-Autofill, wirksamer Hebel (v1.10, Querfund Alien Pass v1.13): Chromiums WebView-Autofill holt den AutofillManager
    // über den Context der WebView (= diese Activity); ohne Manager legt es keine Sitzung an und meldet kein Feld an den Dienst.
    // setImportantForAutofill allein wirkt bei WebViews nicht (Gerätetest GrapheneOS 26.09.2026).
    @Override
    public Object getSystemService(String name) {
        if ("autofill".equals(name)) return null;   // Dienstname des AutofillManager (API 26+, Konstante ist nicht öffentlich)
        return super.getSystemService(name);
    }

    // Gegenstück (v1.10.1, Diff-Review Alien Pass v1.15): Activity.restoreAutofillSaveUi() ruft getAutofillManager() OHNE Null-Prüfung,
    // ausgelöst allein durch diese Intent-Extras — jede App könnte die App sonst beim Schließen abstürzen lassen.
    private static void dropAutofillRestore(Intent i) {
        if (i == null) return;
        i.removeExtra("android.view.autofill.extra.RESTORE_SESSION_TOKEN");
        i.removeExtra("android.view.autofill.extra.RESTORE_CROSS_ACTIVITY");
    }

    @Override
    protected void onNewIntent(Intent intent) {
        dropAutofillRestore(intent);
        super.onNewIntent(intent);
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        dropAutofillRestore(getIntent());
        super.onCreate(savedInstanceState);
        // Kein Screenshot/Screen-Recording, keine Vorschau im App-Switcher (Recents)
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        // Kein Android-Autofill (API 26+, v1.10 — Querfund Alien Pass v1.12): Die WebView meldet sonst jedes Passwortfeld an den
        // systemweiten Autofill-Dienst — eine fremde App, die den Inhalt zum Speichern anbieten könnte. autocomplete="off" im HTML
        // hält das nicht auf.
        if (Build.VERSION.SDK_INT >= 26) {
            View webView = getBridge().getWebView();
            webView.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS);
        }
    }
}
`;
const cur = readFileSync(MAIN, 'utf8');
if (cur !== MAIN_SRC) { writeFileSync(MAIN, MAIN_SRC); console.log('MainActivity: FLAG_SECURE + Autofill-Ausschluss geschrieben.'); }
else console.log('MainActivity bereits gehärtet (FLAG_SECURE + Autofill-Ausschluss).');
const jm = readFileSync(MAIN, 'utf8');
if (!jm.includes('FLAG_SECURE') || !jm.includes('setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS)')
    || !jm.includes('if ("autofill".equals(name)) return null;') || !jm.includes('return super.getSystemService(name);')
    || !jm.includes('dropAutofillRestore(getIntent());') || !jm.includes('dropAutofillRestore(intent);')
    || !jm.includes('i.removeExtra("android.view.autofill.extra.RESTORE_SESSION_TOKEN");') || /\/\/[^\n]*if \("autofill"\.equals/.test(jm)) {
  console.error('FEHLER: MainActivity-Härtung unvollständig (FLAG_SECURE / Autofill-Ausschluss) — Build abgebrochen!');
  process.exit(1);
}
