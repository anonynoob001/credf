import { PRODUCTS, BUMPS, cleanDigits, cleanText, sendJson, skaleRequest } from "../_lib/skale.js";
import { buildUtmifyOrder, clientIp, sendUtmifyOrder } from "../_lib/utmify.js";
import { sendMetaEvent } from "../_lib/meta.js";
import { initEnv } from "../_lib/config.js";

function logTrackingResult({ provider, event, transactionId, result }) {
  const base = { route: "/api/pix", provider, event, transactionId };
  if (result.status === "rejected") {
    console.error(JSON.stringify({
      ...base,
      success: false,
      providerStatus: (result.reason && result.reason.providerStatus) || null,
      message: (result.reason && result.reason.message) || "tracking_failed",
    }));
    return;
  }
  const skipped = Boolean(result.value && (result.value.skipped || result.value.sent === false));
  console[skipped ? "warn" : "info"](JSON.stringify({
    ...base,
    success: !skipped,
    skipped,
    reason: (result.value && result.value.reason) || null,
  }));
}

export async function onRequestPost(context) {
  initEnv(context.env);
  const { request } = context;

  try {
    let body;
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const upKey = cleanText(body.upKey, 32);
    const product = PRODUCTS[upKey];
    let name = cleanText(body.nome, 120);
    let cpf = cleanDigits(body.cpf);
    let email = cleanText(body.email, 160).toLowerCase();
    let phone = cleanDigits(body.phone);

    if (!product) {
      return sendJson(400, { success: false, error: "Oferta inválida." });
    }

    const utms = body.utms && typeof body.utms === "object" ? body.utms : {};
    const orderRef = cleanText(body.eid, 80) || `order_${Date.now()}`;
    const usedCustomerFallback =
      name.length < 3 || cpf.length !== 11 || !email.includes("@") || phone.length < 10;

    if (name.length < 3) name = "Cliente Superatendimento";
    if (cpf.length !== 11) cpf = "00000000191";
    if (!email.includes("@")) {
      email = `cliente.${orderRef.replace(/[^a-zA-Z0-9]/g, "").slice(0, 48)}@superatendimento.app`;
    }
    if (phone.length < 10) phone = "11999999999";

    const baseUrl = new URL(request.url).origin;

    const metadata = {
      offer: upKey,
      orderRef,
      customerFallback: usedCustomerFallback ? "true" : "false",
      createdAt: new Date().toISOString(),
      utm_source: cleanText(utms.utm_source, 120),
      utm_medium: cleanText(utms.utm_medium, 120),
      utm_campaign: cleanText(utms.utm_campaign, 120),
      utm_content: cleanText(utms.utm_content, 120),
      utm_term: cleanText(utms.utm_term, 120),
      utm_id: cleanText(utms.utm_id, 120),
      src: cleanText(utms.src, 120),
      sck: cleanText(utms.sck, 120),
      fbclid: cleanText(utms.fbclid || body.fbclid, 512),
      fbp: cleanText(body.fbp, 255),
      fbc: cleanText(body.fbc, 255),
      external_id: cleanText(body.eid, 160),
      event_source_url: cleanText(body.sourceUrl, 2048),
    };

    const bumpKeys = Array.isArray(body.bumps) ? body.bumps.filter((k) => BUMPS[k]) : [];
    const bumpItems = bumpKeys.map((k) => ({
      title: BUMPS[k].name,
      unitPrice: BUMPS[k].priceCents,
      quantity: 1,
      tangible: false,
      externalRef: BUMPS[k].name,
    }));
    const bumpTotal = bumpItems.reduce((s, it) => s + it.unitPrice, 0);
    const totalAmount = product.priceCents + bumpTotal;
    const allItems = [
      {
        title: product.name,
        unitPrice: product.priceCents,
        quantity: 1,
        tangible: false,
        externalRef: product.name,
      },
      ...bumpItems,
    ];

    const transaction = await skaleRequest("/transactions", {
      method: "POST",
      body: JSON.stringify({
        amount: totalAmount,
        paymentMethod: "pix",
        postbackUrl: `${baseUrl}/api/skale-webhook`,
        pix: { expiresInDays: 1 },
        customer: {
          name,
          email,
          phone,
          document: { number: cpf, type: "cpf" },
        },
        items: allItems,
        metadata,
      }),
    });

    const txnId = cleanText(transaction.id, 160);
    const qrcode = cleanText(transaction.pix && transaction.pix.qrcode, 8192);
    if (!txnId || !qrcode) {
      return sendJson(502, { success: false, error: "Resposta PIX incompleta." });
    }

    const trackingTasks = [{
      provider: "utmify",
      event: "waiting_payment",
      promise: sendUtmifyOrder(buildUtmifyOrder({
        orderId: txnId,
        status: "waiting_payment",
        product: { id: upKey, ...product, priceCents: totalAmount },
        customer: { name, email, phone, document: cpf },
        tracking: metadata,
        createdAt: metadata.createdAt,
        ip: clientIp(request),
      })),
    }];

    const metaUser = {
      name,
      email,
      phone,
      document: cpf,
      externalId: metadata.external_id || orderRef,
      fbp: metadata.fbp,
      fbc: metadata.fbc,
    };
    const sourceUrl = metadata.event_source_url;
    const initiateCheckoutId = cleanText(body.icEventId, 160);
    const leadId = cleanText(body.leadEventId, 160);
    if (/^[a-zA-Z0-9._:-]+$/.test(initiateCheckoutId)) {
      trackingTasks.push({ provider: "meta", event: "InitiateCheckout", promise: sendMetaEvent({
        eventName: "InitiateCheckout",
        eventId: initiateCheckoutId,
        value: totalAmount / 100,
        request,
        eventSourceUrl: sourceUrl,
        user: metaUser,
        customData: {
          content_name: product.name,
          content_ids: [upKey],
          content_type: "product",
        },
      }) });
    }
    if (/^[a-zA-Z0-9._:-]+$/.test(leadId)) {
      trackingTasks.push({ provider: "meta", event: "Lead", promise: sendMetaEvent({
        eventName: "Lead",
        eventId: leadId,
        request,
        eventSourceUrl: sourceUrl,
        user: metaUser,
      }) });
    }
    // O PIX já foi criado. Falha de rastreamento não pode impedir sua exibição.
    const trackingResults = await Promise.allSettled(trackingTasks.map((task) => task.promise));
    trackingResults.forEach((result, index) => logTrackingResult({
      ...trackingTasks[index],
      transactionId: txnId,
      result,
    }));

    return sendJson(201, {
      success: true,
      txnId,
      qrcode,
      qrcodeImage: (transaction.pix && transaction.pix.qrcodeImage) || null,
      amount: totalAmount / 100,
      status: transaction.status || "waiting_payment",
    });
  } catch (error) {
    const statusCode = Number(error.statusCode) || 500;
    return sendJson(statusCode, {
      success: false,
      error: statusCode === 503
        ? "Gateway PIX não configurado."
        : "Não foi possível gerar o PIX agora.",
    });
  }
}
