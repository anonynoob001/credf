// Config e segredos do backend (Skale + UTMify + Meta CAPI).
// Fica em _lib (prefixo "_") pra o Cloudflare Pages NÃO tratar como rota pública.
//
// TOTALMENTE HARDCODED:
// Não é necessário cadastrar NENHUMA variável de ambiente no Cloudflare Pages.
// Basta fazer o deploy que tudo funciona direto com as chaves abaixo.

export let SKALE_API_KEY = "sk_48649443d18869fbe79dbb6e772f69bff05072255af6cdf5e2c59256c697dff6";
export let UTMIFY_API_TOKEN = "sdYnu8UAP6G280pIWv9rNuMFKp5qWa737xyQ";
export let META_ACCESS_TOKEN = "EAAUS0MbgMdcBSwFqVmtzZBPl9fwkPBaMDia1oscT36ZB9n0qwVQfTE8QtGhSfE7VDzNvKmVGxZCmb7iWkUtttjXYBcXUirkAvQSUWdaZA2yenYtQoiS7agrtlUgYm2Ayg9CDygdffS3YtzP3rFOhg08WliFSOPWEdy2eukXzQnmzLxhYxLwY48ykhMpDpwZDZD";
export let META_PIXEL_ID = "28556546307345693";
export let META_API_VERSION = "v25.0";
export let META_TEST_EVENT_CODE = "TEST5702";

export function initEnv(env = {}) {
  // Se futuramente quiser sobrescrever alguma via painel, é opcional:
  if (env && env.SKALE_API_KEY) SKALE_API_KEY = env.SKALE_API_KEY;
  if (env && env.UTMIFY_API_TOKEN) UTMIFY_API_TOKEN = env.UTMIFY_API_TOKEN;
  if (env && env.META_ACCESS_TOKEN) META_ACCESS_TOKEN = env.META_ACCESS_TOKEN;
  if (env && env.META_PIXEL_ID) META_PIXEL_ID = env.META_PIXEL_ID;
  if (env && env.META_API_VERSION) META_API_VERSION = env.META_API_VERSION;
  if (env && env.META_TEST_EVENT_CODE) META_TEST_EVENT_CODE = env.META_TEST_EVENT_CODE;
}
