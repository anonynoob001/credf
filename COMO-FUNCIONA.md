# COMO FUNCIONA — funil SuperSim 3 (FurysMetrics · Trackou · rastreamento · SkalePay)

Este arquivo é o mapa do que acontece quando alguém usa o funil, **para dar pra
trocar qualquer coisa sem adivinhar**. Tudo aqui foi lido do código desta pasta
(`server.js` + `api/*.js`), não de memória.

⛔ **NENHUM SEGREDO MORA AQUI.** Só nomes e tamanhos. Os valores das 5 chaves vão
na aba **Environment** do app no EasyPanel, nunca no código nem neste `.md`.

---

## 1. O retrato geral

```
NAVEGADOR (as páginas de public/)                 SERVIDOR (server.js + api/*.js)
  pixel A + pixel B (fbq)  ─┐
  snippet FurysMetrics ─────┤                       /api/track  → Meta CAPI (A+B)   [topo do funil]
  (data-ws no HTML)         │   POST /api/pix  ───►  /api/pix    → SkalePay cria Pix
                            │                        │           → FurysMetrics (pending)
                            │                        │           → Trackou (sale.pending)
                            │                        │           → Meta CAPI IC+Lead (só FRONT)
  GET /api/status (polling) ┘                        /api/status → SkalePay consulta
                                                      /api/cpf    → consulta CPF (4 fontes)
  SkalePay ──POST postback──────────────────────►   /api/webhook → FurysMetrics (approved)
                                                                  → Trackou (sale.approved)
                                                                  → Meta CAPI Purchase (só FRONT)
```

- **`server.js`** (Express, 1 processo, porta **3000**) serve as páginas de `public/`
  (`/1`→`1.html`, redireciona `/up1`→`/up1/`), roteia `/api/*` e, no boot, instala o
  `geoip-lite` em `req.cf` {country, regionCode, city} a partir do IP real do
  `X-Forwarded-For` (o Traefik do EasyPanel repassa). Health em `/healthz`.
- Os **10 handlers de `api/`** são os MESMOS que já rodaram na Cloudflare e na Vercel —
  não foram reescritos para a VPS. A única adaptação de plataforma é o `server.js`.

---

## 2. As 5 chaves (aba Environment do EasyPanel)

| nome | tamanho | pra quê |
|---|---|---|
| `SKALE_API_KEY` | ~67 | criar e consultar Pix na SkalePay (recebe o dinheiro) |
| `FURYS_WS_KEY` | 48 | chave SECRETA da dashboard FurysMetrics (`x-api-key` do `/vendas`) |
| `TRACKOU_API_KEY` | 68 | enviar a venda pra Trackou |
| `FB_TOKEN_A` | ~205 | token da API de Conversões do **pixel A** |
| `FB_TOKEN_B` | ~203 | token da API de Conversões do **pixel B** |

⚠️ **Sem as 5, o site sobe e NÃO gera Pix / não marca venda / não manda Meta — SEM erro
em tela.** Conferir sempre com um Pix de teste, não só abrindo a página.

### ⛔ NÃO adicionar estas (de propósito):
- **`BASE_URL`** — o funil usa o **host da própria requisição** para montar o `postbackUrl`
  da SkalePay (auto-cura: a venda grava o postback no mesmo endereço em que nasceu).
  Setar `BASE_URL` trava o postback num endereço só; se o domínio mudar, **a venda fica
  pendente pra sempre, sem erro em tela**. (O antigo fallback `https://${VERCEL_URL}`
  gravava `https://undefined/api/webhook` — o motivo de nunca mais depender dele.)
- **`UTMIFY_API_TOKEN`** — a SuperSim 3 nunca usou UTMify; sem o token, o código sai fora
  sozinho (`sendUtmifyOrder` retorna no `if (!token)`).
- **`FB_TEST_EVENT_CODE`** — ligado em produção, a venda REAL vira evento de teste e
  **some do conjunto de dados do Meta**.

> ⚠️ O `DEPLOY-EASYPANEL.md` e o `.env.example` desta pasta ainda mandam setar `BASE_URL`
> — **estão errados**. Vale esta seção.

---

## 3. Rastreamento Meta — DOIS pixels + CAPI (`api/_meta.js`)

### Os identificadores (ficam no HTML de `public/`, e no código do `_meta.js`)
| | id do pixel | token | nome no Gerenciador |
|---|---|---|---|
| **A** | `1697296481759432` | `FB_TOKEN_A` | SUPER - EMPRETIMO |
| **B** | `2057805311542760` | `FB_TOKEN_B` | SIM - EMPRETIMOS |

Todo evento sai para os **dois pixels em paralelo**, com o **mesmo `event_id`** (o Meta
deduplica navegador × servidor por esse id). Graph **v26.0**.

### ⛔ Pixel SÓ no FRONT — `ehFront(upKey)`
`ehFront` = `/^seguro(_plus|_max)?(_ds)?$/`. Só as páginas de FRENTE (`seguro`,
`seguro_plus`, `seguro_max`, `seguro_ds`) disparam pixel. **Upsell/downsell (`up1…up12`,
`n_*`, `_ds` deles) NUNCA** — se o navegador mandar `upKey` de upsell pro `/api/track`,
o `_meta.js` recusa (`upsell_fora_do_pixel`).

### Quando cada evento dispara
| evento | onde | regra |
|---|---|---|
| `PageView`/`ViewContent`/`Lead`/`AddPaymentInfo` | navegador (fbq) + `/api/track` (CAPI) | só FRONT |
| `InitiateCheckout` + `Lead` | `/api/pix` (CAPI), ao gerar o Pix | só FRONT |
| **`Purchase`** | **`/api/webhook` (CAPI), SÓ quando paid/approved** | só FRONT; `eventId = id` da transação |
| `PurchaseFront` | `/api/webhook`, só na base `seguro` | `eventId = id + "_front"` |

⛔ **`Purchase` NUNCA no `/api/track` nem no `/api/pix`** — só no webhook, com a venda
confirmada. Disparar antes polui o dataset com venda que não aconteceu.

### Dados do usuário (Advanced Matching)
Hasheados SHA-256 (via `api/_crypto.js`, SHA-256 em JS puro): email, telefone, nome,
sobrenome, `external_id` (CPF), país, estado, cidade. Em claro: IP, user-agent, `fbp`,
`fbc`. **Geo** vem de `req.cf` (geoip-lite no `server.js`), com `x-vercel-ip-*` de reserva.
⛔ **Nunca inventar estado/cidade** — campo vazio é omitido (inventar piora o match).

### 🔧 Trocar de pixel
1. Troca o id no HTML de `public/` (procure `1697296481759432` e `2057805311542760`).
2. Troca `FB_TOKEN_A`/`FB_TOKEN_B` na aba Environment.
3. Se for UM pixel só, repita o mesmo id e o mesmo token em A e B.

---

## 4. FurysMetrics — a dashboard (`api/_furys.js`)

- **Endpoint:** `https://fxmalxbvkuzlsyabuwoe.supabase.co/functions/v1/vendas`
  (projeto Supabase `fxmalxbvkuzlsyabuwoe`).
- **Chave PÚBLICA** (vai no HTML de `public/`, pode aparecer): `data-ws="016d0860cb0fd49e1a2504bdbbc8ba697fa5"`
  + `data-uid-de="_extid"`.
- **Chave SECRETA:** `FURYS_WS_KEY` (env), enviada no header `x-api-key`. Nunca no HTML.
- **O fio que liga venda ↔ visita:** `trck_user_id` = `_extid` (do snippet no HTML) = `eid`
  (que o `pix.js` guarda no `metadata` da SkalePay e o `webhook.js` recupera). É por ele
  que a venda herda a campanha/UTM da visita.
- **Idempotente pelo `transaction_id`** (o id da SkalePay): a MESMA venda `pending` vira
  `approved` TRANSITANDO a linha, nunca duplica.
- `statusDaDash` mapeia o status do gateway → approved / pending / refused / refunded /
  chargeback. Status que não casa = **não é enviado** (devolve null).
- `idDaUtm` extrai o id da campanha do `utm_campaign` `nome|id` (corta no último `|`,
  exige `/^[0-9]{6,25}$/`). `enviarFurys` tenta 3×/6s, repete em timeout/5xx/429 (não em
  4xx), e **GRITA no log se `FURYS_WS_KEY` faltar**.

### 🔧 Trocar de dashboard
Troca o `data-ws` no HTML de `public/` (a pública) **e** a `FURYS_WS_KEY` na Environment
(a secreta). As duas são da MESMA dashboard — trocar uma só faz a venda cair na dash errada
em silêncio.

---

## 5. Trackou (`api/_trackou.js`)

- **Endpoint:** `https://trackou.io/api/webhooks/sales/{TRACKOU_API_KEY}`
  (a chave vai na URL **e** no header `x-webhook-secret`).
- **É baseado em EVENTO** (`eventoDoStatus`): `sale.pending`, `sale.approved`,
  `sale.refunded`, `sale.chargeback`.
- 🔴 **A pegadinha (bug de 30/09→01/10):** se o corpo for enviado SEM o campo `event`, a
  Trackou assume `sale.approved` e conta como venda aprovada. Por isso `eventoDoStatus`
  devolve **null** (= NÃO envia) para refused/canceled/expired — em vez de deixar a Trackou
  "adivinhar" aprovado.
- `enviarTrackou` tem timeout de 5s e **nunca lança** (falha dela não derruba a venda).
- A Trackou **não tem API de leitura nem de delete** — venda de teste que entrar lá fica;
  só dá pra apagar à mão no painel.

### 🔧 Trocar de dashboard Trackou
Troca só a `TRACKOU_API_KEY` na Environment. Sem ela, a venda não vai pra Trackou (e o
código não quebra).

---

## 6. SkalePay — o Pix (`api/pix.js`, `api/webhook.js`, `api/status.js`)

- **`api/pix.js`** cria o Pix: `POST https://api.skalepayments.com.br/transactions`, header
  `X-API-Key = SKALE_API_KEY`. Preço vem do SERVIDOR (`PRODUCTS`/`BUMPS`), nunca do
  navegador. No `metadata` ele guarda tudo que o webhook vai precisar (upKey, preço, nome,
  cpf, email, phone, **eid**, utms, fbp, fbc, ip, ua, geo, productName). CPF inválido cai no
  dummy válido `11144477735`.
- **`api/webhook.js`** recebe o postback da SkalePay e confirma a venda: FurysMetrics
  primeiro (transita pending→approved), depois Trackou, depois Meta Purchase (só FRONT).
  `dataDoEvento` usa só a data do PAGAMENTO; data futura ou >30d é ignorada (a dash usa
  `now()`).
- **`api/status.js`** faz o polling: `GET /transactions/{id}` → `{status, paid}`.
- **`postbackUrl`** = host da própria requisição (ver §2, por que `BASE_URL` fica sem setar).

### 🔧 Trocar de conta SkalePay
Troca só a `SKALE_API_KEY` na Environment. ⚠️ **Essa chave decide em QUAL conta o dinheiro
cai.** Nunca reaproveitar a chave de uma pessoa para a estrutura de outra (a conta da Anna,
por exemplo, é a dela — GOLDEN FLOW — e tem chave própria).

---

## 7. `/api/cpf` — consulta de CPF com fallback

Quatro fontes em cadeia (zapgroup → cred-pix → pix-sempre → zipcardx); se uma cai, a próxima
assume. Só devolve erro se as quatro falharem. Normaliza sempre para `{nome, mae, nascimento}`.
Roda no servidor de propósito (CORS/token). Não depende das 5 chaves acima.

---

## 8. Se mudar o DOMÍNIO

1. No EasyPanel, aba **Domains** do app, adicione o domínio novo → HTTPS automático.
2. **Não precisa mexer em env nenhuma** (o postback é auto-cura pelo host).
3. Troca o link **só nos anúncios que ENTREGAM** (ferramenta `_repontar_ss3.mjs
   --so-entregando --para=https://NOVO_DOMINIO --executar`) e re-aponta o failover.
4. DNS **FORA da Cloudflare** (A record direto no IP; se usar Cloudflare, nuvem **CINZA**).
   Nome **neutro** (sem super/sim/credito/emprestimo/dinheiro/loan/cash) e nunca reusar
   domínio já marcado.

---

## 9. Testar sem sujar as dashboards

- **Um tracker só** (FurysMetrics, Trackou ou Meta): POSTe DIRETO no endpoint dele — NUNCA
  gere um Pix no funil só pra testar um tracker (o funil manda pra todos de uma vez).
- **Funil inteiro:** um Pix REAL, avisando antes que vai aparecer venda em todas as dashes;
  depois apague a venda de teste.
- `/9` tem que mostrar **R$ 19,48**; `POST /api/pix` com produto inválido → **400** (não
  500); `/api/track` com PageView → **received 2** (os dois pixels); `/server.js` e
  `/api/_meta.js` → **404** (código não vaza).
