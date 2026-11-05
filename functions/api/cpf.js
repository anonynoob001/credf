import { sendJson } from "../_lib/skale.js";

const TIMEOUT_MS = 4000;

function fetchT(url, opts, ms) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  return fetch(url, Object.assign({}, opts, { signal: c.signal })).finally(() => clearTimeout(t));
}

function achaCampo(obj, chaves) {
  if (!obj || typeof obj !== "object") return null;
  for (const k of chaves) {
    if (obj[k] !== undefined && obj[k] !== null && obj[k] !== "") return obj[k];
  }
  for (const k of Object.keys(obj)) {
    if (typeof obj[k] === "object" && obj[k] !== null) {
      const achou = achaCampo(obj[k], chaves);
      if (achou) return achou;
    }
  }
  return null;
}

function normalizaData(v) {
  const s = String(v || "").trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? `${iso[3]}/${iso[2]}/${iso[1]}` : s;
}

function padroniza(data, fonte) {
  const nascimento = normalizaData(achaCampo(data, [
    "birthDate", "nascimento", "NASC", "nasc", "data_nascimento", "DATA_NASCIMENTO",
    "dataNascimento", "dt_nascimento", "DT_NASCIMENTO", "data_nasc", "birth", "birthday",
  ]));
  if (!nascimento) return null;
  return {
    nome: achaCampo(data, ["name", "nome", "NOME", "Nome"]) || "Cliente",
    mae: achaCampo(data, ["motherName", "mae", "MAE", "nome_mae", "NOME_MAE", "nomeMae", "Nome_Mae"]) || "",
    nascimento,
    telefone: achaCampo(data, ["phone", "telefone", "TELEFONE", "celular"]) || "",
    fonte,
  };
}

const FONTES = [
  {
    nome: "zapgroup",
    consultar: async (cpf) => {
      const url = `https://api.zapgroup.shop/consultar-filtrada/cpf?cpf=${cpf}&token=8b00b8adc1f9cdc83f02d6c680b8d6fcce64e08c7907283a7c13e3616ac56635`;
      const r = await fetchT(url, { headers: { "User-Agent": "Mozilla/5.0" } }, TIMEOUT_MS);
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    },
  },
  {
    nome: "cred-pix",
    consultar: async (cpf) => {
      const r = await fetchT("https://cred-pix-top.com/api/cpf-lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0" },
        body: JSON.stringify({ cpf }),
      }, TIMEOUT_MS);
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    },
  },
  {
    nome: "pix-sempre",
    consultar: async (cpf) => {
      const r = await fetchT("https://pix-sempre.com/api/cpf-lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0" },
        body: JSON.stringify({ cpf }),
      }, TIMEOUT_MS);
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    },
  },
  {
    nome: "zipcardx",
    consultar: async (cpf) => {
      const r = await fetchT(`https://api.zipcardx.online/api/v1/consult/${encodeURIComponent(cpf)}`, {
        headers: {
          Authorization: "Bearer dc22fed4e36650211ed5cdee647f8e6db2cdb8dd300777eeedfc23c15e4fe1d1",
          Accept: "application/json",
          "User-Agent": "Mozilla/5.0",
        },
      }, TIMEOUT_MS);
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    },
  },
];

export async function onRequestOptions() {
  return new Response(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);
  const cpf = String(url.searchParams.get("cpf") || "").replace(/\D/g, "");

  if (cpf.length !== 11) {
    return sendJson(400, { error: "CPF invalido" }, { "Access-Control-Allow-Origin": "*" });
  }

  const so = String(url.searchParams.get("fonte") || "").trim().toLowerCase();
  const fontes = so ? FONTES.filter((f) => f.nome === so) : FONTES;
  if (!fontes.length) {
    return sendJson(400, { error: "Fonte desconhecida" }, { "Access-Control-Allow-Origin": "*" });
  }

  const falhas = [];
  for (const fonte of fontes) {
    try {
      const bruto = await fonte.consultar(cpf);
      const out = padroniza(bruto, fonte.nome);
      if (out) {
        return sendJson(200, Object.assign({ cpf }, out), { "Access-Control-Allow-Origin": "*" });
      }
      falhas.push(fonte.nome + ": sem data de nascimento");
    } catch (err) {
      falhas.push(fonte.nome + ": " + err.message);
    }
  }

  return sendJson(502, { error: "Erro ao consultar CPF", falhas }, { "Access-Control-Allow-Origin": "*" });
}
