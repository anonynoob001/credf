import { PRODUCTS, cleanDigits, cleanText } from "./skale.js";
import { buildUtmifyOrder, clientIp, sendUtmifyOrder } from "./utmify.js";
import { sendMetaEvent } from "./meta.js";

export function customerFromTransaction(transaction, fallback = {}) {
  const user = transaction.customer || transaction.user || fallback.user || {};
  return {
    name: cleanText(user.name || fallback.name, 120),
    email: cleanText(user.email || fallback.email, 160).toLowerCase(),
    phone: cleanDigits(user.phone || fallback.phone),
    document: cleanDigits(
      user.cpf ||
      (user.document && user.document.number) ||
      user.document ||
      fallback.cpf ||
      fallback.document,
    ),
  };
}

export async function syncPaidTransaction(transaction, request, fallback = {}) {
  const metadata = transaction.metadata || fallback.metadata || {};
  const offer = cleanText(metadata.offer, 32);
  const product = PRODUCTS[offer];
  const customer = customerFromTransaction(transaction, fallback);
  const transactionId = cleanText(transaction.id, 160) || cleanText(fallback.id, 160);
  const customerRef = cleanText(metadata.orderRef || metadata.external_id || transactionId, 160)
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 48) || "pedido";

  // A consulta resumida da Skale por ID não devolve o cliente. Para permitir
  // a recuperação de vendas antigas, preenchemos somente os campos obrigatórios
  // com valores técnicos determinísticos; IDs, oferta, valor e UTMs permanecem reais.
  if (!customer.name) customer.name = "Cliente Superatendimento";
  if (!customer.email) customer.email = `cliente.${customerRef}@superatendimento.app`;

  if (!product || !transactionId) {
    console.warn(JSON.stringify({
      route: "/api/payment-sync",
      transactionId,
      success: false,
      reason: "missing_order_context",
      hasOffer: Boolean(offer),
      hasProduct: Boolean(product),
      hasName: Boolean(customer.name),
      hasEmail: Boolean(customer.email),
      transactionFields: Object.keys(transaction || {}).sort(),
      metadataFields: Object.keys(metadata || {}).sort(),
      customerFields: Object.keys(transaction.customer || transaction.user || {}).sort(),
    }));
    return { synced: false, reason: "missing_order_context" };
  }

  const utmifyPromise = sendUtmifyOrder(buildUtmifyOrder({
    orderId: transactionId,
    status: "paid",
    product: { id: offer, ...product },
    customer,
    tracking: metadata,
    createdAt: metadata.createdAt || transaction.createdAt || fallback.createdAt,
    approvedDate: metadata.payment_date || transaction.updatedAt || fallback.updatedAt || new Date(),
    ip: clientIp(request),
  }));
  const metaPromise = sendMetaEvent({
    eventName: "Purchase",
    eventId: transactionId,
    value: product.priceCents / 100,
    request,
    eventSourceUrl: metadata.event_source_url,
    user: {
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      document: customer.document,
      externalId: metadata.external_id || metadata.orderRef,
      fbp: metadata.fbp,
      fbc: metadata.fbc,
    },
    customData: {
      content_name: product.name,
      content_ids: [offer],
      content_type: "product",
    },
  });

  // UTMify e Meta são independentes; executá-las em paralelo reduz o tempo
  // entre a confirmação da Skale e o redirecionamento do comprador.
  const [utmifyResult, metaResult] = await Promise.allSettled([utmifyPromise, metaPromise]);
  const utmifySynced = utmifyResult.status === "fulfilled" && !utmifyResult.value.skipped;
  const metaSynced = metaResult.status === "fulfilled" && metaResult.value.sent;

  [
    { provider: "utmify", event: "paid", result: utmifyResult, success: utmifySynced },
    { provider: "meta", event: "Purchase", result: metaResult, success: metaSynced },
  ].forEach(({ provider, event, result, success }) => {
    const reason = result.status === "rejected" ? result.reason : result.value;
    console[success ? "info" : "error"](JSON.stringify({
      route: "/api/payment-sync",
      provider,
      event,
      transactionId,
      success,
      providerStatus: (reason && reason.providerStatus) || null,
      message: success ? null : (reason && (reason.message || reason.reason)) || "tracking_failed",
    }));
  });

  if (!utmifySynced || !metaSynced) {
    const failure = utmifyResult.status === "rejected"
      ? utmifyResult.reason
      : metaResult.status === "rejected"
        ? metaResult.reason
        : new Error("Rastreamento de pagamento não configurado.");
    failure.statusCode = Number(failure.statusCode) || 502;
    throw failure;
  }

  return { synced: true, utmifySynced, metaSynced };
}
