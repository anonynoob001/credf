import { initEnv } from "./_lib/config.js";

// Middleware do Cloudflare Pages: intercepta todas as rotas e injeta as variáveis de ambiente
export async function onRequest(context) {
  initEnv(context.env);
  return await context.next();
}
