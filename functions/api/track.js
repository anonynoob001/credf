import { cleanText, sendJson } from "../_lib/skale.js";
import { ALLOWED_EVENTS, sendMetaEvent } from "../_lib/meta.js";
import { initEnv } from "../_lib/config.js";

export async function onRequestPost(context) {
  initEnv(context.env);
  const { request } = context;

  try {
    const contentLength = Number(request.headers.get("content-length")) || 0;
    if (contentLength > 16 * 1024) {
      return sendJson(413, { success: false, error: "Evento muito grande." });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const eventName = cleanText(body.eventName, 64);
    const eventId = cleanText(body.eventId, 160);
    const value = body.value === undefined || body.value === null ? undefined : Number(body.value);

    if (!ALLOWED_EVENTS.has(eventName) || !eventId || !/^[a-zA-Z0-9._:-]+$/.test(eventId)) {
      return sendJson(400, { success: false, error: "Evento inválido." });
    }
    if (value !== undefined && (!Number.isFinite(value) || value < 0 || value > 1000000)) {
      return sendJson(400, { success: false, error: "Valor do evento inválido." });
    }

    const result = await sendMetaEvent({
      eventName,
      eventId,
      value,
      request,
      eventSourceUrl: body.sourceUrl,
      user: {
        name: body.nome,
        email: body.email,
        phone: body.phone,
        document: body.cpf,
        externalId: body.eid,
        fbp: body.fbp,
        fbc: body.fbc,
      },
    });

    if (!result.sent) {
      console.warn(JSON.stringify({
        route: "/api/track",
        provider: "meta",
        event: eventName,
        eventId,
        success: false,
        reason: result.reason,
      }));
      return sendJson(202, {
        success: true,
        serverTracking: false,
        reason: result.reason,
      });
    }

    console.info(JSON.stringify({
      route: "/api/track",
      provider: "meta",
      event: eventName,
      eventId,
      success: true,
      eventsReceived: result.eventsReceived,
    }));

    return sendJson(200, {
      success: true,
      serverTracking: true,
      eventsReceived: result.eventsReceived,
    });
  } catch (error) {
    console.error(JSON.stringify({
      route: "/api/track",
      provider: "meta",
      success: false,
      providerStatus: (error && error.providerStatus) || null,
      message: (error && error.message) || "tracking_failed",
    }));
    return sendJson(Number(error.statusCode) || 500, {
      success: false,
      serverTracking: false,
      error: "Não foi possível registrar o evento agora.",
    });
  }
}
