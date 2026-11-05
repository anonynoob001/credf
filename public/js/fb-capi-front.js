// Espelho CAPI do FRONT (páginas de entrada) — PageView e ViewContent com o MESMO event_id do
// navegador, pra Meta deduplicar. Só roda nas páginas que têm o pixel (o pixel é só do front;
// upsell/downsell não carregam este arquivo nem o fbq).
//
// O snippet do <head> dispara o fbq com um eventID e empurra [nome, id, valor] em window.__fbQ.
// Aqui a fila é descarregada pro /api/track (que repassa pra CAPI com Advanced Matching).
//  · PageView vai ao servidor UMA vez por sessão (as demais páginas ficam só no navegador) —
//    mantém o volume de chamadas ao Worker baixo.
//  · Funciona também com o pixel bloqueado (adblock / navegador do Instagram): é exatamente
//    o caso em que o servidor cobre o que o navegador perdeu.
(function () {
  function ck(n) { var m = document.cookie.match('(^|;)\\s*' + n + '\\s*=\\s*([^;]+)'); return m ? m.pop() : null; }
  function eid() {
    try {
      var v = localStorage.getItem('_extid');
      if (!v) { v = 'u_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12); localStorage.setItem('_extid', v); }
      return v;
    } catch (e) { return ''; }
  }
  function fbCookies() {
    var fbp = ck('_fbp'), fbc = ck('_fbc');
    if (!fbc) { try { var cl = sessionStorage.getItem('_fbclid') || localStorage.getItem('fbclid'); if (cl) fbc = 'fb.1.' + Date.now() + '.' + cl; } catch (e) {} }
    return { fbp: fbp, fbc: fbc };
  }
  function ls(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }

  function espelhar(nome, id, valor) {
    try {
      var c = fbCookies();
      var corpo = {
        eventName: nome, eventId: id, value: valor == null ? undefined : valor,
        email: ls('email'), phone: ls('telefone') || ls('telephone'), nome: ls('nome'), cpf: ls('cpf'),
        eid: eid(), fbp: c.fbp, fbc: c.fbc,
      };
      fetch('/api/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo), keepalive: true }).catch(function () {});
    } catch (e) {}
  }

  function processa(item) {
    var nome = item[0], id = item[1], valor = item[2];
    if (nome === 'PageView') {
      try { if (sessionStorage.getItem('fb_pv_sent')) return; sessionStorage.setItem('fb_pv_sent', '1'); } catch (e) {}
    }
    espelhar(nome, id, valor);
  }

  // dá tempo do pixel gravar _fbp/_fbc no 1º acesso antes de ler os cookies
  setTimeout(function () {
    var fila = window.__fbQ || [];
    for (var i = 0; i < fila.length; i++) processa(fila[i]);
    window.__fbQ = { push: function (it) { processa(it); } };
  }, 1500);
})();
