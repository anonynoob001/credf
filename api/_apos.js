// Rodar trabalho DEPOIS de responder — funciona na Vercel E na Cloudflare.
//
// POR QUE ISTO EXISTE
// O /api/pix responde o QR Code na hora e manda o rastreio (UTMify, Meta CAPI
// IniciarCheckout+Lead, FurysMetrics pendente, Trackou pendente) em paralelo.
// Na Cloudflare o shim punha globalThis.__cfWaitUntil e o Worker segurava o
// trabalho pendente. Na Vercel, uma Serverless Function pode ser CONGELADA
// assim que a resposta sai — o que ainda estava voando se PERDE, sem erro
// nenhum: a venda aparece na SkalePay e não aparece na dash. Por isso aqui a
// gente agenda o trabalho de propósito, e quando NÃO dá para agendar o
// chamador espera mais antes de responder (ver pix.js).
//
// ⛔ NAO trocar por import estatico de "@vercel/functions": a MESMA pasta roda
// na Cloudflare (sem node_modules), e o import estatico derrubaria o worker.
// O waitUntil do @vercel/functions é um envelope em cima deste mesmo símbolo.

const SIMBOLO_VERCEL = Symbol.for("@vercel/request-context");

// Agenda a promessa para continuar depois da resposta.
// Devolve true se CONSEGUIU agendar; false se ninguém vai segurar o processo.
export function aposResponder(promessa) {
  if (!promessa || typeof promessa.then !== "function") return false;

  // Cloudflare Workers: quem põe isto no globalThis é o _shim.js.
  try {
    if (typeof globalThis.__cfWaitUntil === "function") {
      globalThis.__cfWaitUntil(promessa);
      return true;
    }
  } catch (e) {}

  // Vercel: o runtime expõe o contexto da requisição neste símbolo.
  try {
    const loja = globalThis[SIMBOLO_VERCEL];
    const ctx = loja && typeof loja.get === "function" ? loja.get() : null;
    if (ctx && typeof ctx.waitUntil === "function") {
      ctx.waitUntil(promessa);
      return true;
    }
  } catch (e) {}

  return false;
}
