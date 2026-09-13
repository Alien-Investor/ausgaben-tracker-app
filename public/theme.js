"use strict";
/* Theme-Init vor dem ersten Render (läuft synchron im <head>). LS-Key alien-theme ist markenweit
   geteilt mit Sachwert-Tresor und Alien Pass. */
(function(){try{var t=localStorage.getItem('alien-theme');if(t==='soft')document.documentElement.setAttribute('data-theme','soft');}catch(_){}})();
