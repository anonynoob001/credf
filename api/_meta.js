// CAPI da Meta — UM lugar só (pix.js, webhook.js e track.js importam daqui).
//
// REGRAS (pedido do Kauã, 12/10):
//  · O pixel/CAPI é SÓ DO FRONT. Upsell e downsell de upsell nunca mandam
//    evento pro Meta (testes do Guilherme Vieta: pixel no upsell sobe o CPA).
//    Quem decide é `ehFront(upKey)` — aqui, no servidor, não só no navegador.
//  · Purchase só no webhook, com pagamento confirmado.
//  · Mesmo event_id do navegador → o Meta deduplica.
//  · Advanced Matching máximo: em, ph, fn, ln, external_id, country, st, ct,
//    ip, user-agent, fbp, fbc. Tudo hasheado (SHA-256) menos ip/ua/fbp/fbc.
import { sha256hex } from "./_crypto.js";

// 16/10: o pixel antigo 26918311271184563 ficou INDISPONÍVEL na Meta (desde 15/10 16:24).
// Agora são DOIS pixels, e todo evento vai para os DOIS (reserva: se um cair, o outro já
// tem o histórico). Cada pixel tem o PRÓPRIO token (secret do worker).
export const PIXELS = [
  { id: "1697296481759432", nome: "SUPER - EMPRETIMO", env: "FB_TOKEN_A" },
  { id: "2057805311542760", nome: "SIM - EMPRETIMOS", env: "FB_TOKEN_B" },
];
export const FB_PIXEL_ID = PIXELS[0].id;
const GRAPH = "https://graph.facebook.com/v26.0";

// Front = a oferta principal e as variações dela (completo/premium/desconto).
export function ehFront(upKey) {
  return /^seguro(_plus|_max)?(_ds)?$/.test(String(upKey || ""));
}

export function cleanKey(v) { return (v || "").replace(/[^\x20-\x7E]/g, "").trim(); }
function sha(str) { return sha256hex(String(str || "").toLowerCase().trim()); }

// telefone no padrão Meta: só dígitos, DDI 55 na frente
export function normalizePhoneBR(p) {
  let d = (p || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.length <= 11 && !d.startsWith("55")) d = "55" + d;
  return d;
}
// nome: minúsculo, sem pontuação/dígito (acento fica — o Meta pede UTF-8)
function limpaNome(s) { return String(s || "").toLowerCase().replace(/[^\p{L}\s]/gu, "").trim(); }
// cidade: minúscula, sem acento, espaço nem pontuação
function limpaCidade(s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z]/g, ""); }

// Geografia da PESSOA, tirada da borda na hora do clique (no webhook o
// request é da SkalePay, não dela — por isso vai guardada no metadata).
//
// Lê as DUAS bordas, nesta ordem:
//   1) Cloudflare: request.cf (country / regionCode / city)
//   2) Vercel: cabeçalhos x-vercel-ip-country / -country-region / -city
// ⛔ Nunca inventar: sem borda nenhuma, fica só o "br" de padrão (o público é
// 100% Brasil) e estado/cidade saem de fora — campo vazio é OMITIDO no
// montarUserData, e mandar estado errado à Meta piora a correspondência.
export function geoDoRequest(req) {
  const cf = (req && req.cf) || {};
  const h = (req && req.headers) || {};
  const cab = (n) => {
    const v = h[n] != null ? h[n] : h[String(n).toLowerCase()];
    return v == null ? "" : String(Array.isArray(v) ? v[0] : v);
  };

  // A Vercel manda a cidade com %20 no lugar do espaço.
  let cidadeVercel = cab("x-vercel-ip-city");
  try { cidadeVercel = decodeURIComponent(cidadeVercel); } catch (e) {}

  const pais = String(cf.country || cab("x-vercel-ip-country") || "").toLowerCase();
  const estado = String(cf.regionCode || cab("x-vercel-ip-country-region") || "");
  const cidade = String(cf.city || cidadeVercel || "");

  const out = { co: pais || "br" };
  if (pais === "br" || !pais) {
    if (estado) out.st = estado.toLowerCase().slice(0, 2);
    if (cidade) out.ct = limpaCidade(cidade);
  }
  return out;
}

export function montarUserData({ nome, cpf, email, phone, eid, fbp, fbc, ip, ua, geo }) {
  const parts = limpaNome(nome).split(/\s+/).filter(Boolean);
  const phoneN = normalizePhoneBR(phone);
  const emailClean = (email || "").trim();
  const ext = [];
  if (cpf) { const c = String(cpf).replace(/\D/g, ""); if (c) ext.push(sha(c)); }
  if (eid) ext.push(sha(eid));
  const ud = {};
  // campo vazio se OMITE (não manda [] nem null — derruba o match)
  if (emailClean) ud.em = [sha(emailClean)];
  if (phoneN) ud.ph = [sha(phoneN)];
  if (parts[0]) ud.fn = [sha(parts[0])];
  if (parts.length > 1) ud.ln = [sha(parts[parts.length - 1])];
  if (ext.length) ud.external_id = ext;
  if (geo && geo.co) ud.country = [sha(geo.co)];
  if (geo && geo.st) ud.st = [sha(geo.st)];
  if (geo && geo.ct) ud.ct = [sha(geo.ct)];
  if (ip) ud.client_ip_address = ip;
  if (ua) ud.client_user_agent = ua;
  if (fbp) ud.fbp = fbp;
  if (fbc) ud.fbc = fbc;
  return ud;
}

function fetchT(url, opts, ms) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  return fetch(url, Object.assign({}, opts, { signal: c.signal })).finally(() => clearTimeout(t));
}

/**
 * Manda UM evento pra CAPI.
 *  ev: { eventName, eventId, eventTime?, sourceUrl?, upKey?, valor?, orderId?, produto?, categoria?, user:{...}, semValor? }
 * Devolve { ok, enviado, motivo?, recebidos? } e LOGA o resultado — falha da Meta
 * aparece no log (antes ela sumia no .catch).
 */
export async function enviarEventoMeta(ev) {
  const destinos = PIXELS.map((p) => ({ ...p, token: cleanKey(process.env[p.env]) })).filter((p) => p.token);
  if (!destinos.length) { console.error("[meta] FB_TOKEN_A/FB_TOKEN_B ausentes — CAPI desligada"); return { ok: false, enviado: false, motivo: "sem_token" }; }
  // TRAVA DO FRONT: se veio com upKey e não é front, não sai.
  if (ev.upKey != null && ev.upKey !== "" && !ehFront(ev.upKey)) {
    return { ok: true, enviado: false, motivo: "upsell_fora_do_pixel" };
  }

  const agora = Math.floor(Date.now() / 1000);
  let t = Number(ev.eventTime) || agora;
  if (t > agora || agora - t > 6 * 86400) t = agora;   // Meta recusa futuro e > 7 dias

  const dado = {
    event_name: ev.eventName,
    event_time: t,
    action_source: "website",
    user_data: montarUserData(ev.user || {}),
  };
  if (ev.eventId) dado.event_id = String(ev.eventId);
  if (ev.sourceUrl) dado.event_source_url = String(ev.sourceUrl).slice(0, 1000);

  if (!ev.semValor) {
    const valor = Number(ev.valor) || 0;
    const cd = { value: valor, currency: "BRL" };
    if (ev.produto) {
      cd.content_name = ev.produto;
      cd.content_type = "product";
      cd.content_ids = [ev.upKey || "seguro"];
      cd.contents = [{ id: ev.upKey || "seguro", quantity: 1, item_price: valor }];
      cd.num_items = 1;
    }
    if (ev.categoria) cd.content_category = ev.categoria;
    if (ev.orderId) cd.order_id = String(ev.orderId);
    dado.custom_data = cd;
  }

  const corpo = { data: [dado] };
  const teste = cleanKey(process.env.FB_TEST_EVENT_CODE);
  if (teste) corpo.test_event_code = teste;

  // Os dois pixels em paralelo, com o MESMO event_id (a Meta deduplica por pixel).
  const res = await Promise.all(destinos.map((p) => enviarAoPixel(p, corpo, ev)));
  const ok = res.filter((r) => r.ok);
  if (ok.length) return { ok: true, enviado: true, recebidos: ok.reduce((n, r) => n + (r.recebidos || 0), 0), pixels: res };
  return { ok: false, enviado: false, motivo: res[0]?.motivo || "rede", pixels: res };
}

async function enviarAoPixel(p, corpo, ev) {
  const url = `${GRAPH}/${p.id}/events?access_token=${p.token}`;
  for (let tentativa = 1; tentativa <= 2; tentativa++) {
    try {
      const r = await fetchT(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) }, 6000);
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.events_received >= 1) {
        console.log(`[meta] ok ${ev.eventName} pixel=${p.id} id=${ev.eventId || "-"} recebidos=${d.events_received}`);
        return { ok: true, pixel: p.id, recebidos: d.events_received };
      }
      console.error(`[meta] RECUSADO ${ev.eventName} pixel=${p.id} http=${r.status} ${JSON.stringify(d).slice(0, 300)}`);
      if (r.status < 500) return { ok: false, pixel: p.id, motivo: "recusado", http: r.status };
    } catch (e) {
      console.error(`[meta] falha de rede ${ev.eventName} pixel=${p.id} (tentativa ${tentativa}): ${e && e.message}`);
    }
  }
  return { ok: false, pixel: p.id, motivo: "rede" };
}
