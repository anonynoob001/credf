// Relay CAPI genérico — espelha eventos do TOPO do funil (PageView/ViewContent/Lead/
// AddPaymentInfo...) server-side com Advanced Matching e dedup por event_id.
// ⚠️ REGRA DE OURO: Purchase NUNCA passa por aqui — só pelo webhook (venda confirmada).
// ⚠️ PIXEL SÓ NO FRONT: se o navegador mandar `upKey` de upsell/downsell, o _meta.js recusa.
import { enviarEventoMeta, geoDoRequest } from "./_meta.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { eventName, eventId, value, email, phone, nome, cpf, eid, fbp, fbc, upKey } = req.body || {};

  // Purchase é exclusivo do webhook — bloqueia aqui pra não poluir o dataset com venda não confirmada
  if (!eventName || eventName === "Purchase" || eventName === "PurchaseFront") return res.status(400).json({ error: "evento inválido" });

  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || null;
  const ua = req.headers["user-agent"] || null;

  const r = await enviarEventoMeta({
    eventName,
    eventId,
    sourceUrl: req.headers["referer"] || null,
    upKey: upKey || null,
    valor: value,
    semValor: value == null,
    user: { nome, cpf, email, phone, eid, fbp, fbc, ip, ua, geo: geoDoRequest(req) },
  });

  if (r.motivo === "sem_token") return res.status(200).json({ ok: false, skipped: "no token" });
  if (r.motivo === "upsell_fora_do_pixel") return res.status(200).json({ ok: true, skipped: "upsell fora do pixel" });
  return res.status(200).json({ ok: r.ok, received: r.recebidos ?? null });
};
