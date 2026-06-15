// icons.js — eigene Neon-Line-Icons (statt Emojis). Stroke = currentColor, damit sie
// die Buttonfarbe (inkl. Hover/Danger) erben. window.ICON.svg(name, cls).
(function () {
  'use strict';
  const P = {
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    trash: '<path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
    pause: '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>',
    play: '<path d="M7 4l13 8-13 8Z"/>',
    briefcase: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    shield: '<path d="M12 2l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V5Z"/><path d="M12 11v3"/><circle cx="12" cy="9.5" r="1.2"/>',
    repeat: '<path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
    coins: '<ellipse cx="9" cy="6" rx="7" ry="3"/><path d="M2 6v5c0 1.66 3.13 3 7 3s7-1.34 7-3V6"/><path d="M2 11v5c0 1.66 3.13 3 7 3 1.5 0 2.9-.2 4-.55"/><circle cx="17.5" cy="16.5" r="5.5"/><path d="M17.5 14.2v4.6M16 15.6h2.2a1.1 1.1 0 0 1 0 2.2H16"/>',
    eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff: '<path d="M9.9 4.2A11 11 0 0 1 12 4c7 0 11 8 11 8a18 18 0 0 1-2.3 3.3"/><path d="M6.6 6.6A18 18 0 0 0 1 12s4 8 11 8a11 11 0 0 0 5.4-1.4"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/><path d="M2 2l20 20"/>'
  };
  function svg(name, cls) {
    return `<svg class="icon ${cls || ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;
  }
  window.ICON = { svg, names: Object.keys(P) };
})();
