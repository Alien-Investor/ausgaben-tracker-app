// crypto.js — clientseitige Verschlüsselung (WebCrypto), 1:1 nach Sachwert-Tresor-Muster.
// AES-256-GCM, Schlüssel via PBKDF2-SHA256 (600.000 Iterationen). Keine Dependencies.
// Exportiert window.AusgabenCrypto. Der abgeleitete Schlüssel bleibt nur in-memory.
(function () {
  'use strict';
  const enc = new TextEncoder(), dec = new TextDecoder();
  const ITER = 600000;

  function bufToB64(buf) {
    let b = ''; const u = new Uint8Array(buf);
    for (let i = 0; i < u.length; i++) b += String.fromCharCode(u[i]);
    return btoa(b);
  }
  function b64ToBuf(b64) {
    const s = atob(b64); const u = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
    return u.buffer;
  }

  // Passwort + Salt → AES-256-GCM-Schlüssel (nicht extrahierbar)
  async function deriveKey(pass, salt) {
    const base = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
    );
  }

  // Objekt → {iv, ct} (beide base64). IV ist 12 Byte, zufällig pro Verschlüsselung.
  async function encryptObj(obj, key) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj)));
    return { iv: bufToB64(iv), ct: bufToB64(ct) };
  }

  // {iv, ct} + key → Objekt. Wirft bei falschem Schlüssel (GCM-Auth schlägt fehl).
  async function decryptBlob(blob, key) {
    const pt = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(b64ToBuf(blob.iv)) }, key, b64ToBuf(blob.ct)
    );
    return JSON.parse(dec.decode(pt));
  }

  window.AusgabenCrypto = { ITER, bufToB64, b64ToBuf, deriveKey, encryptObj, decryptBlob };
})();
