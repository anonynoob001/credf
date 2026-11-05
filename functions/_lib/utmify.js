import { UTMIFY_API_TOKEN } from "./config.js";

const UTMIFY_ORDERS_URL = "https://api.utmify.com.br/api-credentials/orders";

function utcDate(value = new Date()) {
  let date = value instanceof Date ? value : new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) date = new Date();
  return date.toISOString().slice(0, 19).replace("T", " ");
}

function nullable(value) {
  const text = String(value || "").trim();
  return text || null;
}

// Em Cloudflare, cf-connecting-ip é o IP real do cliente (definido pela borda,
// não pode ser falsificado pelo requisitante) — preferido sobre x-forwarded-for.
export function clientIp(request) {
  const headers = request.headers;
  const cf = String(headers.get("cf-connecting-ip") || "");
  if (cf) return cf.trim();
  const forwarded = String(headers.get("x-forwarded-for") || "");
  return (forwarded.split(",")[0] || "").trim();
}

export function buildUtmifyOrder({
  orderId,
  status,
  product,
  customer,
  tracking = {},
  createdAt,
  approvedDate,
  ip,
}) {
  return {
    orderId,
    platform: "Skale Payments",
    paymentMethod: "pix",
    status,
    createdAt: utcDate(createdAt),
    approvedDate: status === "paid" ? utcDate(approvedDate) : null,
    refundedAt: null,
    customer: {
      name: customer.name,
      email: customer.email,
      phone: nullable(customer.phone),
      document: nullable(customer.document),
      country: "BR",
      ip: nullable(ip),
    },
    products: [{
      id: product.id,
      name: product.name,
      planId: null,
      planName: null,
      quantity: 1,
      priceInCents: product.priceCents,
    }],
    trackingParameters: {
      src: nullable(tracking.src),
      sck: nullable(tracking.sck),
      utm_source: nullable(tracking.utm_source),
      utm_campaign: nullable(tracking.utm_campaign),
      utm_medium: nullable(tracking.utm_medium),
      utm_content: nullable(tracking.utm_content),
      utm_term: nullable(tracking.utm_term),
    },
    commission: {
      totalPriceInCents: product.priceCents,
      gatewayFeeInCents: 0,
      userCommissionInCents: product.priceCents,
      currency: "BRL",
    },
    isTest: false,
  };
}

export async function sendUtmifyOrder(order) {
  const token = UTMIFY_API_TOKEN;
  if (!token) return { skipped: true };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(UTMIFY_ORDERS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-token": token,
      },
      body: JSON.stringify(order),
      signal: controller.signal,
    });
    if (!response.ok) {
      const error = new Error("A UTMify recusou o pedido.");
      error.statusCode = response.status;
      error.providerStatus = response.status;
      throw error;
    }
    return { skipped: false, statusCode: response.status };
  } finally {
    clearTimeout(timeout);
  }
}
