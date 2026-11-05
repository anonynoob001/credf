import { cleanText, sendJson, skaleRequest } from "../_lib/skale.js";
import { syncPaidTransaction } from "../_lib/payment.js";
import { initEnv } from "../_lib/config.js";

export async function onRequestGet(context) {
  initEnv(context.env);
  const { request } = context;
  const txnId = cleanText(new URL(request.url).searchParams.get("id"), 160);

  if (!txnId || !/^[a-zA-Z0-9_-]+$/.test(txnId)) {
    return sendJson(400, {
      success: false,
      paid: false,
      error: "Transação inválida.",
    });
  }

  try {
    const transaction = await skaleRequest(`/transactions/${encodeURIComponent(txnId)}`, {
      method: "GET",
    });
    const status = cleanText(transaction.status, 40);
    let trackingSynced = false;
    let metaSynced = false;

    if (status === "paid") {
      try {
        const sync = await syncPaidTransaction(transaction, request);
        trackingSynced = sync.synced;
        metaSynced = sync.metaSynced;
      } catch (error) {
        console.error(JSON.stringify({
          route: "/api/status",
          event: "paid_sync",
          transactionId: txnId,
          success: false,
          providerStatus: (error && error.providerStatus) || null,
          message: (error && error.message) || "tracking_failed",
        }));
        // A Skale continua sendo a fonte de verdade mesmo se o rastreamento falhar.
      }
    }

    return sendJson(200, {
      success: true,
      paid: status === "paid",
      status,
      txnId: cleanText(transaction.id, 160) || txnId,
      trackingSynced,
      metaSynced,
    });
  } catch (error) {
    const statusCode = Number(error.statusCode) || 500;
    return sendJson(statusCode, {
      success: false,
      paid: false,
      error: statusCode === 404
        ? "Transação não encontrada."
        : statusCode === 503
          ? "Gateway PIX não configurado."
          : "Não foi possível consultar o pagamento agora.",
    });
  }
}
