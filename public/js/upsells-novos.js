/* ============================================================
   CredFácil · Upsells Novos (Cadeia B)
   ============================================================ */
(function (window) {
  'use strict';
  window.__isUpsellsNovos = true;
  if (!window.redirectToNextUpsell && typeof window.redirectToNextUpsell !== 'function') {
    // Carrega upsells-shared se ainda não foi carregado
    var s = document.createElement('script');
    s.src = '/js/upsells-shared.js';
    document.head.appendChild(s);
  }
})(window);
