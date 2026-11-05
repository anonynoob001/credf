// Envia a venda (pendente OU aprovada) para a Trackou (trackou.io) — dashboard
// NOVA que o Kauã pediu em 30/09, ADICIONAL à UTMify e à FurysMetrics (as três
// continuam recebendo, nenhuma foi tirada).
//
// ⚠️ NÃO existe doc pública da Trackou. O formato abaixo foi DESCOBERTO por
// sondagem (transaction_id + amount são os únicos campos exigidos — testado
// com amount:0 e transaction_id reaproveitado pra não sujar a dashboard com
// linha nova a cada tentativa). Os outros campos (produto/cliente/utm_*) NÃO
// foram confirmados como lidos de verdade — a API aceita (200) qualquer coisa
// a mais sem reclamar, então não dá pra saber se ela IGNORA silenciosamente.
// ⇒ Se a atribuição por campanha não aparecer certa na dashboard dele, é aqui
// que se confere PRIMEIRO — pedir pra Trackou (suporte deles) a doc real do
// endpoint /api/webhooks/sales/{chave} resolve isso de vez.
//
// `transaction_id` = o MESMO id que já usamos na UTMify/Furys (o `id`/`data.id`
// da SkalePay) — reenviar o mesmo id TRANSICIONA a venda (confirmado: 2º POST
// com o mesmo transaction_id voltou "action":"updated", não "created" de novo).
//
// ⚠️ Falha aqui NUNCA pode derrubar a venda nem atrasar QR/webhook: timeout
// curto, try/catch, nunca lança.
function cleanKey(v) { return (v || "").replace(/[^\x20-\x7E]/g, "").trim(); }
function fetchT(url, opts, ms) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  return fetch(url, Object.assign({}, opts, { signal: c.signal })).finally(() => clearTimeout(t));
}

// 01/10 — A DOC SAIU (https://trackou.io/docs/webhook) e mostrou o defeito:
// a Trackou NAO le "status", le "event" — e SEM "event" ela assume
// "sale.approved" (e dispara Purchase na CAPI dela). Por isso todo Pix GERADO
// entrava como venda APROVADA e nenhum aparecia como "pix gerado".
// Eventos que existem: sale.pending · sale.approved · sale.refunded · sale.chargeback.
// Status da SkalePay sem evento equivalente (refused, canceled, expired...) NAO
// e enviado: mandar sem "event" viraria aprovada de novo.
function eventoDoStatus(status) {
  const s = String(status || "").toLowerCase();
  if (s === "waiting_payment" || s === "pending" || s === "processing") return "sale.pending";
  if (s === "paid" || s === "approved") return "sale.approved";
  if (s === "refunded") return "sale.refunded";
  if (s === "chargeback" || s === "chargedback" || s === "chargeback_dispute") return "sale.chargeback";
  return null;
}

// Extrai o ID numérico do Meta de dentro do utm (`nome|123456789`). MESMA regra
// do _furys.js e do funil: corta no ÚLTIMO `|`, aceita só 6–25 dígitos.
function idDaUtm(valor) {
  const s = String(valor || "");
  const i = s.lastIndexOf("|");
  if (i < 0) return null;
  const cauda = s.slice(i + 1).trim();
  return /^[0-9]{6,25}$/.test(cauda) ? cauda : null;
}

async function enviarTrackou({ transactionId, status, amount, produto, nome, email, phone, utms, fbp, fbc, ip, ua, eid, saleDate }) {
  const chave = cleanKey(process.env.TRACKOU_API_KEY);
  if (!chave) return;

  const event = eventoDoStatus(status);
  if (!event) {
    console.log("[trackou] status", status || "-", "sem evento na Trackou, nao enviado", transactionId);
    return;
  }

  const u = utms || {};
  const body = {
    event,
    transaction_id: String(transactionId),
    amount: Number(amount) || 0,
    currency: "BRL",
    payment_method: "pix",
    product_name: produto || undefined,
    customer_name: nome || undefined,
    customer_email: email || undefined,
    customer_phone: phone || undefined,
    utm_source:   (utms && utms.utm_source)   || undefined,
    utm_medium:   (utms && utms.utm_medium)   || undefined,
    utm_campaign: (utms && utms.utm_campaign) || undefined,
    utm_content:  (utms && utms.utm_content)  || undefined,
    utm_term:     (utms && utms.utm_term)     || undefined,
    // IDs explícitos do Meta (além do |id dentro do utm) — a doc da Trackou
    // aceita os dois; mandar explícito GARANTE a atribuição na campanha.
    meta_campaign_id: idDaUtm(u.utm_campaign) || undefined,
    meta_adset_id:    idDaUtm(u.utm_medium)   || undefined,
    meta_ad_id:       idDaUtm(u.utm_content)  || undefined,
    sck:          (utms && utms.sck)          || undefined,
    src:          (utms && utms.src)          || undefined,
    fbp: fbp || undefined,
    fbc: fbc || undefined,
    client_ip_address: ip || undefined,
    client_user_agent: ua || undefined,
    external_id: eid || undefined,
    country: "BR",
    sale_date: saleDate || new Date().toISOString(),
  };

  try {
    const r = await fetchT(`https://trackou.io/api/webhooks/sales/${chave}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-webhook-secret": chave },
      body: JSON.stringify(body),
    }, 5000);
    const txt = await r.text().catch(() => "");
    console.log("[trackou]", event, "id", transactionId, "http", r.status, txt.slice(0, 200));
  } catch (err) {
    console.error("[trackou] falha:", err.message);
  }
}

export { enviarTrackou, eventoDoStatus };
