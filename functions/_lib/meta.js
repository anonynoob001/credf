import { META_ACCESS_TOKEN, META_PIXEL_ID, META_API_VERSION, META_TEST_EVENT_CODE } from "./config.js";

const DEFAULT_PIXEL_ID = "4640541149524307";
const DEFAULT_API_VERSION = "v25.0";
export const ALLOWED_EVENTS = new Set([
  "PageView",
  "ViewContent",
  "Lead",
  "CompleteRegistration",
  "InitiateCheckout",
  "AddPaymentInfo",
  "Purchase",
]);

function clean(value, maxLength = 255) {
  return String(value || "").trim().slice(0, maxLength);
}

function digits(value) {
  return clean(value).replace(/\D/g, "");
}

function phoneWithCountryCode(value) {
  let phone = digits(value);
  if (phone && phone.length <= 11 && !phone.startsWith("55")) phone = `55${phone}`;
  return phone;
}

// Cloudflare Workers não tem node:crypto — usa a Web Crypto API nativa (async).
async function hash(value) {
  const normalized = clean(value).toLowerCase();
  if (!normalized) return "";
  const data = new TextEncoder().encode(normalized);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function safeSourceUrl(value) {
  const raw = clean(value, 2048);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function requestIp(request) {
  const headers = request && request.headers;
  const cf = clean(headers && headers.get("cf-connecting-ip"));
  if (cf) return cf;
  const forwarded = clean(headers && headers.get("x-forwarded-for"));
  return (forwarded.split(",")[0] || "").trim();
}

async function buildUserData(user = {}, request = {}) {
  const nameParts = clean(user.name, 120).split(/\s+/).filter(Boolean);
  const document = digits(user.document || user.cpf);
  const persistentId = clean(user.externalId, 160);

  const [email, phone, firstName, lastName, documentHash, persistentIdHash] = await Promise.all([
    hash(user.email),
    hash(phoneWithCountryCode(user.phone)),
    hash(nameParts[0]),
    hash(nameParts.length > 1 ? nameParts[nameParts.length - 1] : ""),
    document ? hash(document) : Promise.resolve(""),
    persistentId ? hash(persistentId) : Promise.resolve(""),
  ]);

  const externalIds = [documentHash, persistentIdHash].filter(Boolean);

  const data = {};
  if (email) data.em = [email];
  if (phone) data.ph = [phone];
  if (firstName) data.fn = [firstName];
  if (lastName) data.ln = [lastName];
  if (externalIds.length) data.external_id = [...new Set(externalIds)];
  if (clean(user.fbp)) data.fbp = clean(user.fbp);
  if (clean(user.fbc)) data.fbc = clean(user.fbc);

  const ip = requestIp(request);
  const userAgent = clean(request && request.headers && request.headers.get("user-agent"), 512);
  if (ip) data.client_ip_address = ip;
  if (userAgent) data.client_user_agent = userAgent;
  return data;
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

export async function sendMetaEvent({
  eventName,
  eventId,
  value,
  user,
  request,
  eventSourceUrl,
  eventTime,
  customData,
}) {
  if (!ALLOWED_EVENTS.has(eventName)) {
    const error = new Error("Evento da Meta inválido.");
    error.statusCode = 400;
    throw error;
  }

  const accessToken = META_ACCESS_TOKEN;
  if (!accessToken) return { sent: false, reason: "not_configured" };

  const pixelId = clean(META_PIXEL_ID || DEFAULT_PIXEL_ID, 32);
  const requestedVersion = clean(META_API_VERSION || DEFAULT_API_VERSION, 16);
  const apiVersion = /^v\d+\.\d+$/.test(requestedVersion) ? requestedVersion : DEFAULT_API_VERSION;
  if (!/^\d+$/.test(pixelId)) {
    const error = new Error("META_PIXEL_ID inválido.");
    error.statusCode = 503;
    throw error;
  }

  const sourceUrl = safeSourceUrl(
    eventSourceUrl ||
    (request && request.headers && (request.headers.get("referer") || request.headers.get("origin"))),
  );
  const numericValue = Number(value);
  const event = {
    event_name: eventName,
    event_time: Number.isFinite(Number(eventTime))
      ? Math.floor(Number(eventTime))
      : Math.floor(Date.now() / 1000),
    event_id: clean(eventId, 160),
    action_source: "website",
    user_data: await buildUserData(user, request),
  };
  if (sourceUrl) event.event_source_url = sourceUrl;
  if (Number.isFinite(numericValue) && numericValue >= 0) {
    event.custom_data = {
      currency: "BRL",
      value: numericValue,
      ...(customData && typeof customData === "object" ? customData : {}),
    };
  }

  const payload = { data: [event] };
  const testEventCode = clean(META_TEST_EVENT_CODE, 80);
  if (testEventCode) payload.test_event_code = testEventCode;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(
      `https://graph.facebook.com/${apiVersion}/${pixelId}/events`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      },
    );
    const result = await readJson(response);
    if (!response.ok) {
      const error = new Error("A Meta recusou o evento de conversão.");
      error.statusCode = 502;
      error.providerStatus = response.status;
      throw error;
    }
    return {
      sent: true,
      eventsReceived: Number(result.events_received) || 1,
    };
  } catch (error) {
    if (error.name === "AbortError") {
      const timeoutError = new Error("Tempo limite excedido ao enviar evento para a Meta.");
      timeoutError.statusCode = 504;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
