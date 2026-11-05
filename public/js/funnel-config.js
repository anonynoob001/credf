/* ============================================================
   CONFIG DO FUNIL — chave-mestra pra alternar entre os upsells
   NOVOS e os ANTIGOS sem perder nenhum dos dois.

   'novo'   → 9.html manda pro checkout.html (com order bumps) e a
              cadeia de upsells vira upn1 → upn2 → … → upn6.
   'antigo' → 9.html gera o Pix direto (como antes) e a cadeia é a
              antiga (up1 → up4 → …), 100% intacta.

   Pra REVERTER pros antigos: troque 'novo' por 'antigo' aqui e faça
   o deploy. Nada mais precisa mudar — os antigos continuam no lugar.
   ============================================================ */
(function () {
  window.FUNNEL = window.FUNNEL || {};
  window.FUNNEL.upsells = 'antigo';   // 'novo' | 'antigo'
  // 16/08 — voltou pros ANTIGOS: os upsells novos (upn1…upn6 + checkout com
  // order bump) não performaram. Os arquivos novos seguem no lugar, sem tráfego.

  // permite forçar por URL só pra teste: ?upsells=antigo  /  ?upsells=novo
  try {
    var v = new URLSearchParams(location.search).get('upsells');
    if (v === 'novo' || v === 'antigo') window.FUNNEL.upsells = v;
  } catch (e) {}

  window.FUNNEL.isNovo = function () { return window.FUNNEL.upsells === 'novo'; };
})();
