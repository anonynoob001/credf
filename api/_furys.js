/* ═══════════════════════════════════════════════════════════════════════════
   _furys.js — espelha a venda deste funil na dashboard da FurysMetrics.

   ⛔ UMA CÓPIA DA REGRA, e é por isso que ela mora aqui e não dentro do
   pix.js/webhook.js. Os dois caminhos (Pix gerado e Pix pago) escrevem a MESMA
   venda, e a coisa só funciona porque os dois mandam o MESMO
   `transaction_id`. Duas leituras separadas do payload divergem na primeira
   correção feita só de um lado — foi assim que este projeto já perdeu venda em
   dashboard errada mais de uma vez.

   ⚠️ O arquivo começa com `_` de propósito: a Vercel não transforma arquivo com
   esse prefixo em rota, então ele é módulo e não endpoint público.

   ─── COMO A VENDA ENCONTRA A VISITA ─────────────────────────────────────────
   `trck_user_id` = o `eid` do funil (localStorage `_extid`), que é o MESMO id
   que o snippet da captura usa (`data-uid-de="_extid"`). É esse fio que faz a
   venda herdar campanha, fbp/fbc e país da pessoa que clicou no anúncio. Se
   alguém trocar a chave num lado e não no outro, nada quebra visivelmente: as
   vendas só passam a chegar sem campanha.
   ═══════════════════════════════════════════════════════════════════════════ */

const FURYS_URL_PADRAO = "https://fxmalxbvkuzlsyabuwoe.supabase.co/functions/v1/vendas";

/* Chave vinda de env pode trazer BOM/invisível (já estourou "Cannot convert
   argument to a ByteString" ao montar header). */
function limpar(v) { return (v || "").replace(/[^\x20-\x7E]/g, "").trim(); }

/* Status do gateway → status que a dash entende.
   ⚠️ Devolve `null` no que não reconhece, e o chamador NÃO envia: mandar um
   status inventado leva 400 e a venda não entra. Silêncio aqui é melhor que
   gravar "pending" por engano numa venda que na verdade foi estornada. */
function statusDaDash(bruto) {
  const s = String(bruto || "").toLowerCase().trim();
  if (s === "paid" || s === "approved") return "approved";
  if (s === "waiting_payment" || s === "pending" || s === "processing") return "pending";
  if (s === "refused" || s === "failed" || s === "canceled" || s === "cancelled" || s === "refused_payment") return "refused";
  if (s === "refunded" || s === "reversed") return "refunded";
  if (s === "partially_refunded") return "partially_refunded";
  if (s === "chargedback" || s === "chargeback") return "chargeback";
  return null;
}

/* O id numérico que o anúncio embute no nome da UTM (`campanha|123456789`).
 *
 * ⚠️ ESTA REGRA JÁ EXISTE EM OUTROS LUGARES e tem de continuar idêntica:
 *      · `public.id_da_utm(text)` no banco da FurysMetrics (migration 0052)
 *      · `idDaUtm` no `_lib.js` do funil do DoramaFLIX
 *      · `backfill-dorama.mjs`
 *    Mudou uma, mudam todas — corta no ÚLTIMO `|` (nome de campanha pode ter
 *    `|` no meio) e exige só dígitos, 6 a 25. Sem essa trava, um pedaço de
 *    texto viraria "campanha" que não existe no Meta.
 *
 * Por que precisa aqui: quando a pessoa está com storage bloqueado (in-app do
 * Instagram, aba anônima), não há visitante para a dash herdar, e a venda cai
 * na atribuição pelo CORPO — que traz a UTM por extenso e nenhum id. Sem esta
 * derivação, essa venda aparece sem campanha mesmo tendo vindo de uma. */
function idDaUtm(valor) {
  const s = String(valor || "");
  const i = s.lastIndexOf("|");
  if (i < 0) return null;
  const cauda = s.slice(i + 1).trim();
  return /^[0-9]{6,25}$/.test(cauda) ? cauda : null;
}

/**
 * Manda a venda para a dash. NUNCA lança e NUNCA atrasa o caminho do dinheiro.
 *
 * @param {object} v
 * @param {string} v.transactionId  id da SkalePay — a identidade da venda nos DOIS envios
 * @param {string} v.status         status cru do gateway (é traduzido aqui)
 * @param {number} v.amount         valor em REAIS (a função da dash arredonda para centavos)
 * @param {string} [v.produto]      nome que aparece na dash
 * @param {string} [v.eid]          id do visitante (localStorage `_extid`)
 * @param {object} [v.utms]         utm_source/medium/campaign/term/content
 * @param {string} [v.ocorreuEm]    ISO. Omitir = agora (o certo para venda acontecendo agora)
 */
async function enviarFurys(v) {
  const chave = limpar(process.env.FURYS_WS_KEY);
  if (!chave) {
    /* GRITA. Sem a env a dash simplesmente fica vazia, e vazio parece "não
       vendeu" — o pior tipo de falha, porque não parece falha. */
    console.error("[furys] FURYS_WS_KEY ausente — venda NÃO foi para a dashboard:", v && v.transactionId);
    return;
  }

  const status = statusDaDash(v.status);
  if (!status) {
    console.error("[furys] status desconhecido, não enviei:", v.status, v.transactionId);
    return;
  }

  const partes = String(v.nome || "").trim().split(/\s+/).filter(Boolean);
  const u = v.utms || {};

  const corpo = {
    transaction_id: String(v.transactionId),
    status,
    valor: Number(v.amount) || 0,
    moeda: "BRL",
    produto: v.produto || null,
    nome: partes[0] || null,
    sobrenome: partes.length > 1 ? partes[partes.length - 1] : null,
    email: v.email || null,
    telefone: v.phone || null,
    /* o fio entre a venda e a visita — ver o cabeçalho */
    trck_user_id: v.eid || null,
    /* Rede de segurança: se o visitante não for encontrado (storage bloqueado,
       navegador in-app), a dash ainda atribui pelo que veio aqui. */
    utm_source: u.utm_source || null,
    utm_medium: u.utm_medium || null,
    utm_campaign: u.utm_campaign || null,
    utm_content: u.utm_content || null,
    utm_term: u.utm_term || null,
    /* ⚠️ Só valem quando a dash NÃO acha o visitante — quando acha, ela usa os
       da visita e ignora o corpo inteiro (a origem da pessoa vence a origem
       declarada pelo servidor). */
    campaign_id: idDaUtm(u.utm_campaign),
    adset_id: idDaUtm(u.utm_medium),
    ad_id: idDaUtm(u.utm_content),
  };
  if (v.ocorreuEm) corpo.ocorreu_em = v.ocorreuEm;

  const url = limpar(process.env.FURYS_VENDAS_URL) || FURYS_URL_PADRAO;

  /* ─── 15/09/2026: UMA TENTATIVA DE 4 s NÃO BASTAVA ────────────────────────
     O timeout de 4 s com UMA tentativa fazia a venda evaporar sempre que a
     dash demorasse — e ela demora justamente no PICO, que é quando mais venda
     cai (medido em 15/09: o `/vendas` chegou a 24,7 s no horário de maior
     tráfego, e 9 chamadas foram abortadas aqui no mesmo dia). Não havia retry,
     nem fila: o `catch` logava e a venda sumia para sempre.

     Agora são até 3 tentativas com espera crescente. O que decide se vale
     tentar de novo:
       · timeout/erro de rede  → SIM (foi o caso dos 4 s)
       · 5xx e 429             → SIM (indisponibilidade nossa; o /vendas passou
                                 a responder 503 com Retry-After exatamente
                                 para isto)
       · 2xx                   → pronto
       · 4xx (401/400)         → NÃO. É veredito: a chave está errada ou o
                                 corpo é inválido, e repetir só gasta tempo.
     Reenviar é de graça: `venda_gravar` é idempotente por transaction_id.

     ⚠️ O teto de tempo total (≈18 s no pior caso) é deliberado: a SkalePay
     espera o 200 deste webhook. Se estourar o tempo dela, ela reenvia — o que
     é inofensivo (idempotente) e ainda joga a favor. */
  const TENTATIVAS = 3;
  const TIMEOUT_MS = 6000;
  const ESPERA_MS = [400, 1200];

  for (let i = 0; i < TENTATIVAS; i++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": chave },
        body: JSON.stringify(corpo),
        signal: ctrl.signal,
      });
      const txt = await r.text().catch(() => "");
      const vaiRepetir = (r.status >= 500 || r.status === 429) && i < TENTATIVAS - 1;
      console.log("[furys]", status, corpo.transaction_id, "http", r.status,
        "tentativa", i + 1, "visitante?", !!corpo.trck_user_id, "R$", corpo.valor,
        vaiRepetir ? "(vou repetir)" : "", txt.slice(0, 200));
      if (!vaiRepetir) {
        /* 4xx é veredito e não se repete — mas GRITA, porque é a única pista de
           que a venda não entrou. */
        if (r.status >= 400) {
          console.error("[furys] ⚠️ VENDA NÃO ENTROU NA DASH:", corpo.transaction_id, "http", r.status, txt.slice(0, 200));
        }
        return;
      }
    } catch (err) {
      const ultima = i === TENTATIVAS - 1;
      console.error("[furys] falha:", err.message, corpo.transaction_id, "tentativa", i + 1,
        ultima ? "⚠️ DESISTI — venda não entrou na dash" : "(vou repetir)");
      if (ultima) return;
    } finally {
      clearTimeout(t);
    }
    await new Promise((r) => setTimeout(r, ESPERA_MS[i] ?? 1200));
  }
}

export { enviarFurys, statusDaDash };
