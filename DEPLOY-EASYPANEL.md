# Subir o funil SuperSim 3 no EasyPanel

O EasyPanel roda **em cima da VPS** (Hostinger). Ele não muda a proteção: o que
impede a Cloudflare de marcar o funil é o **DNS estar FORA da Cloudflare** —
continua valendo. O EasyPanel só troca Nginx+systemd na mão por um painel com
SSL automático (Traefik na frente) e deploy com um clique.

O funil roda **num container Node só**: o `server.js` serve os estáticos, as
páginas sem extensão (`/1` → `1.html`), o redirect `/up1` → `/up1/` **e** as 5
rotas `/api/*`. O Traefik do EasyPanel só repassa tudo para a porta **3000**.
Por isso o `nginx.conf.modelo`, o `supersim3.service` e o `setup-vps.sh`
**não são usados aqui** (ficam na pasta só como plano B de VPS crua).

## Como o EasyPanel recebe o código

Esta pasta tem um **`Dockerfile`** — é o caminho reproduzível. No EasyPanel, o
App pode buildar a partir de:
- **Git** (GitHub/GitLab): o EasyPanel clona o repo e builda o `Dockerfile`. ⚠️
  o repo levaria os ~45 MB de vídeo junto (pesado, mas funciona). Para repo
  leve, mandar o vídeo para o Bunny (ver no fim) antes de commitar.
- **Imagem de registry**: buildar a imagem e dar push para um registry, e o
  EasyPanel puxa de lá.

> O passo de **conectar e subir pelo MCP do EasyPanel** eu faço quando o MCP
> estiver ligado — a fonte (Git x imagem) depende do que o MCP expõe.

## Configuração do App no EasyPanel

- **Tipo:** App (Docker / Dockerfile).
- **Porta interna:** `3000` (o `EXPOSE`/`PORT` do container).
- **Domínio:** o seu domínio → o EasyPanel emite o HTTPS (Let's Encrypt) sozinho.
  ⛔ **O DNS do domínio NÃO pode passar pela Cloudflare** (nameserver/proxy). Se
  passar, ela volta a varrer e marcar. Aponte o A record direto para o IP da VPS.
- **Health check:** caminho `/healthz` (responde `{ok:true}`).
- **Variáveis de ambiente** (na aba Environment do App) — as 5, com valores em
  `Downloads/SuperSim/_envs-supersim3-PARA-A-VERCEL.txt`:
  - ⛔ **`BASE_URL` NÃO deve ser setada** (medido em 19/10, no ar): o Traefik do
    EasyPanel preserva o Host original, então o código cai no **host da própria
    requisição** e cada venda grava o `postbackUrl` no endereço em que nasceu
    (auto-cura). Setar amarra o postback a UM endereço: no dia em que o domínio
    mudar, a confirmação da venda vai para um host morto e a venda fica
    **pendente para sempre, sem erro em tela nenhuma.**
  - `SKALE_API_KEY=...`
  - `FURYS_WS_KEY=...`
  - `TRACKOU_API_KEY=...`
  - `FB_TOKEN_A=...`
  - `FB_TOKEN_B=...`
  - ⛔ **NÃO** setar `UTMIFY_API_TOKEN` (a SS3 nunca usou) nem
    `FB_TEST_EVENT_CODE` (ligado, a venda real vira evento de teste e **some** do
    conjunto de dados do Meta).
  - ⚠️ **Sem as 5 envs, o site sobe e NÃO gera Pix / não marca venda / não manda
    Meta — sem erro em tela.**

## Depois que subir

1. Abrir `https://SEU_DOMINIO/` → é o index "SuperSim"; `/9` com **R$ 19,48**.
2. `POST /api/pix` com `upKey` inválido → **400 "Produto inválido"** (prova que
   a rota Node está viva); `/api/track` com `{}` → 400 (não 500).
3. Gerar **1 Pix real** e conferir que o `postbackUrl` gravado na SkalePay é o
   domínio novo (sai do host da requisição, sem `BASE_URL`), com **controle
   negativo** (a MESMA consulta com chave falsa tem de dar **401**). Apagar a
   venda de teste da dash depois.
4. No FurysMetrics, trocar o link **só nos anúncios que ENTREGAM** (regra 1-6-1):
   `_repontar_ss3.mjs --so-entregando --para=https://SEU_DOMINIO --executar`.
5. Re-apontar o failover (`failover_links` + `failover_config.link_ativo`) para o
   domínio novo.

## Vídeo no CDN (opcional)

45 MB da pasta são `.mp4`. O container Node serve com Range/seek, mas para
muito tráfego o ideal é mandar os vídeos para o Bunny (já usado no DoramaFLIX) e
trocar o `src` nas páginas — aí o container serve só HTML leve e o repo fica
pequeno. Não é obrigatório.

## Por que isto resolve

A Cloudflare marcava pelo CONTEÚDO (8 endereços em 13 dias, inclusive domínios
próprios comprados DENTRO dela). Fora da Cloudflare, host tradicional só age por
denúncia. ⚠️ Não é imunidade: domínio em nameserver Cloudflare volta a cair. E a
Vercel já derrubou 4 contas desta operação por banimento — por isso VPS própria
(com EasyPanel em cima), não Vercel.
