import { sha256hex } from "./_crypto.js";
import { enviarFurys } from "./_furys.js";
import { enviarTrackou } from "./_trackou.js";
import { enviarEventoMeta, ehFront } from "./_meta.js";
function sha256(str) {
  return sha256hex((str || "").toLowerCase().trim());
}
// Limpa BOM/caracteres invisíveis de chaves vindas da Vercel (evita ByteString error)
function cleanKey(v) { return (v || "").replace(/[^\x20-\x7E]/g, "").trim(); }
function fetchT(url, opts, ms) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  return fetch(url, Object.assign({}, opts, { signal: c.signal })).finally(() => clearTimeout(t));
}
// Telefone no padrão Meta: só dígitos, com DDI 55 na frente
function normalizePhoneBR(p) { let d = (p || "").replace(/\D/g, ""); if (!d) return ""; if (d.length <= 11 && !d.startsWith("55")) d = "55" + d; return d; }

// Tabela de preços (R$) — espelha api/pix.js. Usada como fallback do valor
// para GARANTIR que a venda aprovada nunca marque R$ 1 / R$ 0.
const PRICES = {
  seguro: 19.48, seguro_plus: 29.90, seguro_max: 44.90,
  up1: 24.82, up2: 23.91, up3: 18.68, up4: 17.20, up5: 17.00,
  up6: 17.02, up7: 14.06, up8: 14.06, up9: 11.99, up10: 16.92, up11: 19.53, up12: 31.92,
  seguro_ds: 9.74, up1_ds: 12.41, up2_ds: 11.96, up3_ds: 9.34, up4_ds: 8.60, up5_ds: 8.50,
  up6_ds: 8.50, up7_ds: 7.03, up8_ds: 7.03, up9_ds: 6.00, up10_ds: 8.46, up11_ds: 9.77, up12_ds: 15.96,
  // upsells novos (cadeia B) + downsell
  n_tenf: 19.90, n_titular: 26.41, n_iof: 23.44, n_cashback: 17.00, n_proc: 29.90,
  n_tenf_ds: 9.95, n_titular_ds: 13.20, n_iof_ds: 11.72, n_cashback_ds: 8.50, n_proc_ds: 14.95,
};

// (CAPI da Meta agora vive em ./_meta.js — Purchase só do FRONT, v26, geo + event_source_url)

async function sendUtmifyOrder({ orderId, status, amount, utms, nome, upKey, productName, createdAt, approvedAt }) {
  const token = cleanKey(process.env.UTMIFY_API_TOKEN);
  if (!token) return;

  const priceInCents = Math.round(Number(amount) * 100);

  const payload = {
    orderId: String(orderId),
    platform: "other",
    status,
    paymentMethod: "pix",
    amount: Number(amount),
    createdAt: createdAt || new Date().toISOString(),
    approvedDate: approvedAt || (status === "paid" ? new Date().toISOString() : null),
    commission: {
      totalPriceInCents:     priceInCents,
      gatewayFeeInCents:     0,
      userValueInCents:      priceInCents,
      userCommissionInCents: priceInCents,
    },
    customer: {
      name: nome || "Cliente",
      email: "cliente@supersim.com.br",
      phone: null,
      document: null,
    },
    products: [{
      id: upKey || "taxa",
      name: productName || "Taxa SuperSim",
      planId: null,
      planName: null,
      quantity: 1,
      priceInCents,
    }],
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
    const r = await fetchT("https://api.utmify.com.br/api-credentials/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-token": token },
      body: JSON.stringify(payload),
    }, 5000);
    const txt = await r.text().catch(() => "");
    console.log("[utmify]", status, "order", String(orderId), "http", r.status, "utms?", utmsPresent, "amount", Number(amount), txt.slice(0, 300));
  } catch (err) {
    console.error("[utmify] falha:", err.message, err.cause?.message);
  }
}

/* QUANDO a venda aconteceu — não quando este webhook chegou.
   ⛔ SÓ campo de PAGAMENTO (`paidAt` e irmãos). A data de CRIAÇÃO da transação
   NÃO serve: um Pix gerado ontem e pago hoje entraria no dia de ontem, e o dia
   de ontem mudaria sozinho no relatório — o erro mais caro que esta operação já
   cometeu (9 vendas migradas de dia por um reenvio sem data).
   Fora da janela de 30 dias, ou lixo, devolve null: aí a dash usa `now()`, que
   é o certo para o caso normal (webhook chega em segundos). */
function dataDoEvento(body) {
  const b = body || {};
  const t = b.transaction || {};
  const bruto = b.paidAt || b.paid_at || b.approvedAt || b.approved_at ||
                t.paidAt || t.paid_at || t.approvedAt || t.approved_at || null;
  if (!bruto) return null;
  const d = new Date(typeof bruto === "number" ? bruto * 1000 : String(bruto));
  const ms = d.getTime();
  if (!Number.isFinite(ms)) return null;
  const agora = Date.now();
  if (ms > agora + 60 * 60 * 1000) return null;               // futuro = relógio errado
  if (agora - ms > 30 * 24 * 60 * 60 * 1000) return null;     // velho demais para confiar
  return d.toISOString();
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { id, status, metadata, transaction } = req.body || {};

  console.log("[webhook] recebido:", id, status, "meta?", !!metadata, "utms?", !!(metadata && metadata.utms), "upKey", (metadata && metadata.upKey) || "-");

  const utms  = (metadata && metadata.utms)  || {};
  const nome  = (metadata && metadata.nome)  || "Cliente";
  const cpf   = (metadata && metadata.cpf)   || "";
  const email = (metadata && metadata.email) || "";
  const phone = (metadata && metadata.phone) || "";
  const eid   = (metadata && metadata.eid)   || "";
  const upKey = (metadata && metadata.upKey) || "";
  const fbp   = (metadata && metadata.fbp)   || null;
  const fbc   = (metadata && metadata.fbc)   || null;
  const ip    = (metadata && metadata.ip)    || req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || null;
  const ua    = (metadata && metadata.ua)    || req.headers["user-agent"] || null;
  const productName = (metadata && metadata.productName) || "Taxa SuperSim";
  const sourceUrl = (metadata && metadata.sourceUrl) || ((process.env.BASE_URL || "") ? process.env.BASE_URL + "/9.html" : null);
  const geo = (metadata && metadata.geo) || { co: "br" };
  // Valor CERTO — 3 camadas para NUNCA marcar R$ 1 / R$ 0 na venda aprovada:
  //   1) priceReais salvo no metadata na criação (fonte da verdade)
  //   2) tabela de preços por upKey (caso o gateway não devolva o metadata)
  //   3) valor em centavos vindo do gateway (vários formatos de payload) → reais
  const metaPrice  = metadata && metadata.priceReais != null ? Number(metadata.priceReais) : 0;
  const tablePrice = upKey && PRICES[upKey] != null ? Number(PRICES[upKey]) : 0;
  const gatewayCents = Number(
    (transaction && transaction.amount) ??
    (req.body && req.body.amount) ??
    (req.body && req.body.data && req.body.data.amount) ??
    0
  );
  const amount = metaPrice  > 0 ? metaPrice
               : tablePrice > 0 ? tablePrice
               : gatewayCents / 100;

  /* ─── DASHBOARD PRÓPRIA (FurysMetrics) ────────────────────────────────────
     Sai ANTES do resto e para QUALQUER status, e as duas coisas são de
     propósito:

     · antes, porque UTMify e Meta são chamadas de terceiros com timeout de 5 s
       cada — se uma travar, o registro do dinheiro na dash dele não pode ficar
       preso atrás dela;
     · qualquer status, porque a dash é o painel de verdade da operação: recusa
       e estorno também são fatos, e `venda_gravar` sabe transitar
       pending → approved/refused sem duplicar (a identidade é o `id` da
       transação, o MESMO que o /api/pix já mandou).

     ⚠️ Isto TAMBÉM é a rede de segurança do pendente: o envio feito lá no
     /api/pix corre junto da entrega do QR e pode ser cortado quando a função
     responde. Aqui ele chega de novo, e reenviar a mesma transação não
     duplica nada. */
  await enviarFurys({
    transactionId: id,
    status,
    amount,
    produto: productName,
    nome, email, phone, eid,
    utms,
    ocorreuEm: dataDoEvento(req.body),
  });

  /* ─── TRACKOU (nova, pedida em 30/09) ──────────────────────────────────────
     ADICIONAL à UTMify e à FurysMetrics — as duas continuam recebendo, esta
     é a terceira. Cai aqui pra QUALQUER status (pendente, aprovada, recusada)
     — mesmo raciocínio do enviarFurys logo acima: o `id` da SkalePay é o
     `transaction_id` que transiciona a mesma venda, nunca duplica. */
  await enviarTrackou({
    transactionId: id,
    status,
    amount,
    produto: productName,
    nome, email, phone,
    utms,
    fbp, fbc, ip, ua, eid,
    saleDate: dataDoEvento(req.body) || undefined,
  });

  if (status === "paid" || status === "approved") {
    // Pagamento confirmado → UTMify "paid" + Facebook CAPI Purchase
    // ⚠️ REGRA CRÍTICA: Purchase para o Facebook SOMENTE aqui, jamais no waiting_payment
    await sendUtmifyOrder({
      orderId: id,
      status: "paid",
      amount,
      utms,
      nome,
      upKey,
      productName,
      approvedAt: new Date().toISOString(),
    });
    // Meta CAPI — Purchase SÓ do FRONT (regra do Kauã, 12/10). Upsell/downsell: nada pro Meta
    // (a venda continua na UTMify, FurysMetrics e Trackou). Mesmo event_id do navegador = txnId.
    if (ehFront(upKey)) {
      const user = { nome, cpf, email, phone, eid, fbp, fbc, ip, ua, geo };
      const base = { sourceUrl, upKey, valor: amount, orderId: id, produto: productName, categoria: "Taxa SuperSim", eventTime: Math.floor(new Date(dataDoEvento(req.body) || Date.now()).getTime() / 1000), user };
      await enviarEventoMeta({ ...base, eventName: "Purchase", eventId: String(id) });
      // Oferta PRINCIPAL (front = seguro) → também o custom PurchaseFront, dedup próprio (_front)
      if ((upKey || "").replace("_ds", "") === "seguro") {
        await enviarEventoMeta({ ...base, eventName: "PurchaseFront", eventId: String(id) + "_front" });
      }
    } else {
      console.log("[webhook] upsell/downsell " + upKey + " — NÃO enviado ao Meta (pixel só no front)");
    }
  } else if (status === "waiting_payment") {
    // Pix gerado mas não pago ainda → somente UTMify "waiting_payment", NUNCA Facebook
    await sendUtmifyOrder({
      orderId: id,
      status: "waiting_payment",
      amount,
      utms,
      nome,
      upKey,
      productName,
    });
  }

  return res.status(200).json({ ok: true });
};
