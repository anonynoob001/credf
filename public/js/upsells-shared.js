/* ============================================================
   CredFácil · Upsells & Downsells Shared Engine
   Gerencia a esteira de redirecionamento, personalização
   e persistência dos parâmetros de rastreio (UTMs / EID).
   ============================================================ */
(function (window, document) {
  'use strict';

  // Helper para obter parâmetros da URL ou do localStorage
  function getQueryString() {
    var qs = window.location.search || '';
    try {
      var params = new URLSearchParams(qs);
      var eid = localStorage.getItem('_extid');
      if (eid && !params.has('eid') && !params.has('external_id')) {
        params.set('eid', eid);
      }
      var utmKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'src', 'sck'];
      for (var i = 0; i < utmKeys.length; i++) {
        var k = utmKeys[i];
        if (!params.has(k)) {
          var val = localStorage.getItem(k) || sessionStorage.getItem(k);
          if (val) params.set(k, val);
        }
      }
      var str = params.toString();
      return str ? ('?' + str) : '';
    } catch (e) {
      return qs;
    }
  }

  // Redireciona para o próximo passo no funil
  function redirectToNextUpsell() {
    var qs = getQueryString();

    // Se a página definiu explicitamente o próximo passo
    if (window.__upsellNext && typeof window.__upsellNext === 'string') {
      var dest = window.__upsellNext;
      if (dest.indexOf('?') === -1 && qs) dest += qs;
      window.location.href = dest;
      return;
    }

    var path = window.location.pathname;

    // Se estiver no checkout ou no 9.html
    if (path.indexOf('checkout') !== -1 || path.indexOf('9.html') !== -1 || path === '/' || path === '') {
      if (window.FUNNEL && typeof window.FUNNEL.isNovo === 'function' && window.FUNNEL.isNovo()) {
        window.location.href = '/upn1/' + qs;
      } else {
        window.location.href = '/up1/' + qs;
      }
      return;
    }

    // Se estiver na cadeia clássica (up1 ... up12 ou downsell/up1 ... up12)
    var upMatch = path.match(/(?:up|downsell\/up)(\d+)/);
    if (upMatch) {
      var currentNum = parseInt(upMatch[1], 10);
      if (currentNum < 12) {
        window.location.href = '/up' + (currentNum + 1) + '/' + qs;
      } else {
        window.location.href = '/conta.html' + qs;
      }
      return;
    }

    // Se estiver na cadeia nova (upn1 ... upn6 ou downsell/upn1 ... upn6)
    var upnMatch = path.match(/(?:upn|downsell\/upn)(\d+)/);
    if (upnMatch) {
      var currentN = parseInt(upnMatch[1], 10);
      if (currentN < 6) {
        window.location.href = '/upn' + (currentN + 1) + '/' + qs;
      } else {
        window.location.href = '/conta.html' + qs;
      }
      return;
    }

    // Se estiver no downsell do front
    if (path.indexOf('downsell/front') !== -1) {
      window.location.href = '/up1/' + qs;
      return;
    }

    // Fallback final
    window.location.href = '/conta.html' + qs;
  }

  window.redirectToNextUpsell = redirectToNextUpsell;

  // Personalização visual ao carregar qualquer upsell ou downsell
  function initUpsellData() {
    try {
      var nome = (localStorage.getItem('nome') || '').trim();
      var cpf = (localStorage.getItem('cpf') || '').trim();
      var valorEmprestimo = parseFloat(localStorage.getItem('selectedLoanAmount')) || 15000;

      var primeiroNome = nome ? nome.split(' ')[0] : '';
      var hiEl = document.getElementById('hi');
      if (hiEl && primeiroNome) {
        hiEl.textContent = ', ' + primeiroNome;
      }

      var uNomeEls = document.querySelectorAll('.u-nome, #u-nome');
      for (var i = 0; i < uNomeEls.length; i++) {
        if (nome) uNomeEls[i].textContent = nome;
      }

      var uCpfEls = document.querySelectorAll('.u-cpf, #u-cpf');
      for (var j = 0; j < uCpfEls.length; j++) {
        if (cpf) {
          var clean = cpf.replace(/\D/g, '');
          if (clean.length === 11) {
            uCpfEls[j].textContent = clean.slice(0, 3) + '.***.***-' + clean.slice(9);
          } else {
            uCpfEls[j].textContent = cpf;
          }
        }
      }

      var formattedFull = 'R$ ' + valorEmprestimo.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      var formattedShort = 'R$ ' + valorEmprestimo.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

      var creditEls = document.querySelectorAll('#creditAmt, .creditAmt');
      for (var k = 0; k < creditEls.length; k++) {
        creditEls[k].textContent = formattedFull;
      }

      var hAmtEls = document.querySelectorAll('#hAmt, .hAmt');
      for (var l = 0; l < hAmtEls.length; l++) {
        hAmtEls[l].textContent = formattedShort;
      }

      var protoEl = document.getElementById('proto');
      if (protoEl && !protoEl.textContent.trim()) {
        protoEl.textContent = (Math.floor(Math.random() * 900000) + 100000) + '-' + new Date().getFullYear();
      }

      var dataEl = document.getElementById('data');
      if (dataEl && !dataEl.textContent.trim()) {
        dataEl.textContent = new Date().toLocaleDateString('pt-BR');
      }
    } catch (e) {}

    // Countdown timer se existir na página
    initCountdown();
  }

  function initCountdown() {
    var cd = document.querySelector('.countdown, #countdown, #timer, .timer b');
    if (!cd) return;
    var sec = 300; // 5 minutos
    var iv = setInterval(function () {
      sec--;
      if (sec < 0) {
        clearInterval(iv);
        return;
      }
      var m = Math.floor(sec / 60);
      var s = sec % 60;
      cd.textContent = (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
    }, 1000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initUpsellData);
  } else {
    initUpsellData();
  }

})(window, document);
