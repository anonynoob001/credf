// Servidor do funil SuperSim 3 para VPS (Ubuntu + Node + Nginx).
//
// O QUE ELE FAZ, E POR QUE É FINO
// Os handlers em api/*.js são os MESMOS que rodam na Cloudflare e na Vercel —
// ESM, export default (req, res), leem só process.env, req.body, req.query,
// req.headers. Este servidor não os altera; ele só:
//   1) põe globalThis.__cfWaitUntil no boot, para o api/_apos.js achar quem
//      segura o trabalho pós-resposta (num processo persistente a promessa já
//      continua viva no event loop — basta não deixar a rejeição subir);
//   2) preenche req.cf (country/regionCode/city) com GeoIP local do IP REAL,
//      porque na VPS não existe req.cf da Cloudflare nem x-vercel-ip-*; o
//      api/_meta.js lê req.cf primeiro, então zero edição lá;
//   3) roteia /api/pix|status|cpf|webhook|track para cada handler.
//
// Em produção o Nginx fica na frente (HTTPS + estáticos + proxy /api/ aqui).
// Mas este processo TAMBÉM serve os estáticos e as páginas sem extensão, então
// roda sozinho para teste (node server.js) mesmo sem Nginx.

import express from "express";
import geoip from "geoip-lite";
import { fileURLToPath } from "node:url";
import path from "node:path";

// --- (1) quem segura o trabalho pós-resposta (api/_apos.js procura isto) ---
// Processo persistente: a promessa segue no event loop depois do res.end().
// Só não pode deixar a rejeição virar unhandledRejection e derrubar o processo.
globalThis.__cfWaitUntil = (promessa) => {
  try { Promise.resolve(promessa).catch(() => {}); } catch (e) {}
};
process.on("unhandledRejection", (e) => {
  console.error("[servidor] promessa rejeitada sem dono:", e && e.message ? e.message : e);
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, "public");
const PORTA = 3000;

import {
  SKALE_API_KEY,
  UTMIFY_API_TOKEN,
  META_ACCESS_TOKEN,
  META_PIXEL_ID,
  META_TEST_EVENT_CODE,
} from "./functions/_lib/config.js";

// Herda automaticamente as credenciais de functions/_lib/config.js como única fonte da verdade
process.env.SKALE_API_KEY = process.env.SKALE_API_KEY || SKALE_API_KEY;
process.env.UTMIFY_API_TOKEN = process.env.UTMIFY_API_TOKEN || UTMIFY_API_TOKEN;
process.env.META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN || META_ACCESS_TOKEN;
process.env.META_PIXEL_ID = process.env.META_PIXEL_ID || META_PIXEL_ID;
process.env.META_TEST_EVENT_CODE = process.env.META_TEST_EVENT_CODE || META_TEST_EVENT_CODE;

const app = express();
app.disable("x-powered-by");

// Atrás do Nginx: confiar no X-Forwarded-For para achar o IP real do visitante.
app.set("trust proxy", true);

// Corpo JSON para pix/webhook/track. type: () => true cobre beacon que manda
// JSON com content-type text/plain. Corpo inválido vira {} (endpoint de venda/
// rastreio não pode responder 400 por um corpo torto) em vez de derrubar.
app.use((req, res, next) => {
  express.json({ limit: "1mb", type: () => true })(req, res, (err) => {
    if (err) req.body = {};
    next();
  });
});

// --- (2) GeoIP local no IP real → req.cf no formato que o _meta.js espera ---
function ipReal(req) {
  const xff = req.headers["x-forwarded-for"];
  if (xff) return String(xff).split(",")[0].trim();
  return (req.socket && req.socket.remoteAddress) || "";
}
function preencherCf(req) {
  try {
    const ip = ipReal(req);
    const g = ip ? geoip.lookup(ip) : null;
    if (g) {
      // geoip-lite: country ISO-2 (BR), region código (SP), city nome.
      req.cf = { country: g.country || "", regionCode: g.region || "", city: g.city || "" };
    }
  } catch (e) { /* sem geo: o _meta.js cai no "br" e omite estado/cidade */ }
}

// --- (3) rotas /api/* → handlers ESM (carregados uma vez no boot) ---
const ROTAS = {
  "/api/pix": "./api/pix.js",
  "/api/status": "./api/status.js",
  "/api/cpf": "./api/cpf.js",
  "/api/webhook": "./api/webhook.js",
  "/api/skale-webhook": "./api/webhook.js",
  "/api/track": "./api/track.js",
};

async function montarRotas() {
  for (const [rota, arquivo] of Object.entries(ROTAS)) {
    const mod = await import(new URL(arquivo, import.meta.url));
    const handler = mod.default;
    // app.all: GET (status/cpf), POST (pix/webhook/track) e OPTIONS (o próprio
    // handler trata CORS/preflight) caem no mesmo handler, como na Vercel.
    app.all(rota, (req, res) => {
      preencherCf(req);
      Promise.resolve(handler(req, res)).catch((e) => {
        console.error(`[servidor] erro em ${rota}:`, e && e.stack ? e.stack : e);
        if (!res.headersSent) { res.statusCode = 500; res.end("erro interno"); }
      });
    });
  }
}

app.get("/healthz", (req, res) => res.json({ ok: true, t: Date.now() }));

// Estáticos + páginas sem extensão (/1 → public/1.html). O Nginx faz isto em
// produção; aqui é o que deixa o processo rodar sozinho num teste.
app.use(express.static(PUBLIC, { extensions: ["html"], index: "index.html" }));
app.get(/^\/[a-z0-9_-]+$/i, (req, res, next) => {
  res.sendFile(path.join(PUBLIC, req.path.slice(1) + ".html"), (err) => err && next());
});

montarRotas().then(() => {
  app.listen(PORTA, "0.0.0.0", () => console.log(`[servidor] funil SuperSim 3 na porta ${PORTA}`));
}).catch((e) => {
  console.error("[servidor] falhou ao montar as rotas:", e);
  process.exit(1);
});
