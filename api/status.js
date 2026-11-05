// Limpa BOM/caracteres invisíveis de chaves vindas da Vercel (evita ByteString error)
function cleanKey(v) { return (v || "").replace(/[^\x20-\x7E]/g, "").trim(); }
function fetchT(url, opts, ms) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  return fetch(url, Object.assign({}, opts, { signal: c.signal })).finally(() => clearTimeout(t));
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const { id } = req.query;
  if (!id) return res.status(400).json({ error: "ID obrigatório" });

  try {
    const resp = await fetchT(`https://api.skalepayments.com.br/transactions/${id}`, {
      headers: { "X-API-Key": cleanKey(process.env.SKALE_API_KEY) },
    }, 6000);

    const data = await resp.json();
    const paid = data.status === "paid" || data.status === "approved";

    return res.json({ status: data.status, paid });
  } catch (err) {
    console.error("[status] exception:", err.message);
    return res.status(500).json({ error: "Erro interno" });
  }
};
