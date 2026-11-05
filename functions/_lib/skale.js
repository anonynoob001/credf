import { SKALE_API_KEY } from "./config.js";

const SKALE_BASE_URL = "https://api.skalepayments.com.br";

export const PRODUCTS = Object.freeze({
  seguro: { priceCents: 1948, name: "Seguro Prestamista - SuperSim" },
  up1: { priceCents: 2482, name: "IOF - Imposto sobre Operações Financeiras" },
  up2: { priceCents: 2391, name: "Taxa de Verificação de IOF" },
  up3: { priceCents: 1868, name: "Seguro Prestamista - Tarifa de Cadastro" },
  up4: { priceCents: 1720, name: "TENF - Taxa de Emissão da Nota Fiscal" },
  up5: { priceCents: 1700, name: "Ativar Conta" },
  up6: { priceCents: 1702, name: "Taxa de Registro do Contrato" },
  up7: { priceCents: 1406, name: "Taxa - Limite Adicional de R$20.000" },
  up8: { priceCents: 1406, name: "Taxa de Processamento" },
  up9: { priceCents: 1199, name: "Aplicativo SuperSim" },
  up10: { priceCents: 1692, name: "TAC - Taxa de Abertura de Crédito" },
  up11: { priceCents: 1953, name: "Taxa de Consultoria Financeira" },
  up12: { priceCents: 3192, name: "Taxa de Processamento Administrativo" },
  seguro_ds: { priceCents: 1082, name: "Downsell Front - Seguro Prestamista - SuperSim" },
  up1_ds: { priceCents: 1241, name: "Downsell UP1 - IOF - Imposto sobre Operações Financeiras" },
  up2_ds: { priceCents: 1196, name: "Downsell UP2 - Taxa de Verificação de IOF" },
  up3_ds: { priceCents: 934, name: "Downsell UP3 - Seguro Prestamista - Tarifa de Cadastro" },
  up4_ds: { priceCents: 860, name: "Downsell UP4 - TENF - Taxa de Emissão da Nota Fiscal" },
  up5_ds: { priceCents: 850, name: "Downsell UP5 - Ativar Conta" },
  up6_ds: { priceCents: 850, name: "Downsell UP6 - Taxa de Registro do Contrato" },
  up7_ds: { priceCents: 703, name: "Downsell UP7 - Taxa - Limite Adicional de R$20.000" },
  up8_ds: { priceCents: 703, name: "Downsell UP8 - Taxa de Processamento" },
  up9_ds: { priceCents: 600, name: "Downsell UP9 - Aplicativo SuperSim" },
  up10_ds: { priceCents: 846, name: "Downsell UP10 - TAC - Taxa de Abertura de Crédito" },
  up11_ds: { priceCents: 977, name: "Downsell UP11 - Taxa de Consultoria Financeira" },
  up12_ds: { priceCents: 1596, name: "Downsell UP12 - Taxa de Processamento Administrativo" },
});

export function cleanDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

export function cleanText(value, maxLength = 160) {
  return String(value || "").trim().slice(0, maxLength);
}

function requireApiKey() {
  const apiKey = SKALE_API_KEY;
  if (!apiKey) {
    const error = new Error("SKALE_API_KEY não configurada no servidor.");
    error.statusCode = 503;
    throw error;
  }
  return apiKey;
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    const error = new Error("A Skale Payments retornou uma resposta inválida.");
    error.statusCode = 502;
    throw error;
  }
}

export async function skaleRequest(path, options = {}) {
  const apiKey = requireApiKey();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(`${SKALE_BASE_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
        ...(options.headers || {}),
      },
      signal: controller.signal,
    });
    const data = await readJson(response);

    if (!response.ok) {
      const error = new Error("A Skale Payments recusou a solicitação.");
      error.statusCode = response.status >= 500 ? 502 : response.status;
      error.providerStatus = response.status;
      throw error;
    }
    return data;
  } catch (error) {
    if (error.name === "AbortError") {
      const timeoutError = new Error("Tempo limite excedido ao consultar a Skale Payments.");
      timeoutError.statusCode = 504;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function sendJson(status, body, extraHeaders) {
  return new Response(JSON.stringify(body), {
    status,
    headers: Object.assign(
      { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
      extraHeaders || {},
    ),
  });
}
