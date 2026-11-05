import { cleanText, sendJson, skaleRequest } from "../_lib/skale.js";
import { syncPaidTransaction } from "../_lib/payment.js";
import { initEnv } from "../_lib/config.js";

export async function onRequestPost(context) {
  initEnv(context.env);
  const { request } = context;

  let event;
  try {
    event = await request.json();
  } catch {
    return sendJson(400, { success: false, error: "Payload inválido." });
  }
  const txnId = cleanText(event.id || (event.transaction && event.transaction.id), 160);

  if (!txnId || !/^[a-zA-Z0-9_-]+$/.test(txnId)) {
    return sendJson(400, { success: false, error: "Transação inválida." });
  }

  try {
    // O postback por transação não possui assinatura. Sempre confirmamos o ID
    // diretamente com a Skale antes de executar qualquer ação de venda.
    const transaction = await skaleRequest(`/transactions/${encodeURIComponent(txnId)}`, {
      method: "GET",
    });
    const status = cleanText(transaction.status, 40);

    if (status !== "paid") {
      console.info(JSON.stringify({
        route: "/api/skale-webhook",
        transactionId: txnId,
        status,
        success: true,
      }));
      return sendJson(200, { success: true, paid: false, status });
    }

    const sync = await syncPaidTransaction(transaction, request, {
      id: txnId,
      user: event.user,
      metadata: event.metadata,
      createdAt: event.transaction && event.transaction.created_at,
      updatedAt: event.transaction && event.transaction.updated_at,
    });

    console.info(JSON.stringify({
      route: "/api/skale-webhook",
      transactionId: txnId,
      status: "paid",
      success: true,
      utmifySynced: sync.utmifySynced,
      metaSynced: sync.metaSynced,
    }));

    return sendJson(200, {
      success: true,
      paid: true,
      status: "paid",
      trackingSynced: sync.synced,
      metaSynced: sync.metaSynced,
    });
  } catch (error) {
    console.error(JSON.stringify({
      route: "/api/skale-webhook",
      transactionId: txnId,
      success: false,
      providerStatus: (error && error.providerStatus) || null,
      message: (error && error.message) || "webhook_failed",
    }));
    return sendJson(Number(error.statusCode) || 500, {
      success: false,
      error: "Não foi possível processar a confirmação.",
    });
  }
}
