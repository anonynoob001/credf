# BRIEF — Funil CredFácil (reskin do nosso funil SuperSim)

> Este funil é **uma CÓPIA NOVA** do nosso funil SuperSim (`SuperSim/_vps-ss3`), rebatizada para
> **CredFácil**. ⛔ **NÃO tocar nos arquivos da SuperSim.** Tudo acontece SÓ nesta pasta
> (`Downloads/CredFacil-funil`). SuperSim está fora do ar — **testamos LOCALMENTE** (ver §7).

## 0. O que muda e o que NÃO muda
- ⛔ **A OFERTA é a MESMA** (empréstimo pessoal, mesma mecânica, mesmo fluxo, **mesmos preços/
  tarifas/promessas/juros**). **NÃO reescrever copy de venda, NÃO mexer em valor, taxa, prazo,
  parcela, condição de crédito.** Isto é só **troca de MARCA**.
- ✅ **Muda:** nome (Super Sim → **CredFácil**), logo, cores (âmbar/grafite → **verde + laranja**),
  razão social/CNPJ, foto e vídeo da atendente, favicon, ícones, badges, nomes de produto em texto.

## 1. Marca CredFácil
- Logo master (verde "Cred" + laranja "Fácil", figura/seta, "F" laranja): já está em
  `public/images/logo-credfacil-colorido.png` (fundo branco). É a referência de identidade.
- Assinatura/tagline: **"CredFácil — Solicitações de Empréstimos"**.
- Tom: confiável, simples, "crédito fácil e rápido". Verde = confiança/aprovado; laranja = ação.

## 2. Paleta (substituir a âmbar/grafite da SuperSim)
Mapear nas `:root` de cada página e em qualquer hex âmbar fixo:
```
--green      #138A3A   (verde CredFácil — PRIMÁRIA/estrutura)
--green-vivid #1E9E3E
--green-deep  #0E6B2E
--green-dark  #0A5726
--green-wash #eaf6ee
--green-line #cfe9d7
--green-glow rgba(19,138,58,.30)
--orange      #F2881C  (laranja CredFácil — CTA/ação)
--orange-vivid #FF9A2E
--orange-deep  #D96E08
--orange-wash  #fff2e0
--orange-line  #ffd9ac
--orange-glow  rgba(242,136,28,.42)
--paper #ffffff  --shell #f5f7f4  --ink #15241b  --body #3f4a43  --mut #6f7a72  --line #e3ebe4
```
Hex âmbar da SuperSim que viram CredFácil: `#FDAC17`/`#f59e0b`/`#FFB300`/`#FFC000` → `#F2881C`;
`#E07C08`/`#b45309` → `#D96E08`; grafites usados como "verde" (`#2c2620 #40382d #221c15 #191510 #12100b`)
→ os verdes acima. **CTA/botão = laranja; marca/estrutura = verde.**
⚠️ Não quebrar o `--pix:#32bcad` (cor do Pix, mantém).

## 3. Mapa de renomeação de arquivos (criar os novos, remover os antigos)
| antigo (SuperSim) | novo (CredFácil) |
|---|---|
| `images/supersim-logo.png` | `images/credfacil-logo.png` |
| `images/supersim-logo.svg` | `images/credfacil-logo.svg` |
| `images/supericon.png` | `images/credfacil-icon.png` |
| `images/favicon-supersim.png` | `images/favicon-credfacil.png` |
| `images/meninasupersim.png` + `meninasupersim.png` (raiz) | `images/menina-credfacil.png` + `menina-credfacil.png` (raiz) |
| `images/atendente-supersim.png` | `images/atendente-credfacil.png` |
| `s-emp.png` / `s-inv.png` (raiz) | `cf-emp.png` / `cf-inv.png` (raiz) |
| `videos/video-supersim-1.mp4` (+ poster) | `videos/video-credfacil-1.mp4` (+ poster) |
| `videos/supersimapresentacao.mp4` + raiz | `videos/credfacil-apresentacao.mp4` |
- `logo-credfacil-colorido.png` já é CredFácil (serve de master; pode manter o nome).
- Demais vídeos (`vsl-nova.mp4`, `apresentacao.mp4`, `timeline-pix.mp4`, `depoimentos/*`) mantêm o
  nome se não tiverem "supersim" no nome; o que muda é o CONTEÚDO (logo/áudio) quando houver marca.

## 4. CNPJ / razão social — ⛔ NÃO INVENTAR
Rodapé atual: "SuperSim Soluções Financeiras S.A. — CNPJ 33.030.944/0001-60 — São Paulo, SP — 01310-200".
Trocar por: **"CredFácil"** como marca + marcador **`[PENDENTE: razão social e CNPJ da CredFácil]`**
no lugar da razão social/CNPJ/endereço. **Não copiar o CNPJ da SuperSim. Não fabricar um CNPJ.**
O Kauã informa os dados reais depois.

## 5. Atendente (a "conversa")
- Vídeo (`video-credfacil-1.mp4`, 720×1280, 28s): a fala é genérica (não diz "Super Sim"); **o que
  tem de marca é a LOGO "$uper Sim" fixa no topo + grafismos laranja**. Trocar a logo por CredFácil
  e levar os grafismos pro tom CredFácil (verde+laranja). Áudio pode ficar (conferir que não fala a marca).
- Foto do chat (`atendente-credfacil.png`): a atual tem parede e crachá "Super Sim" (ambiente azul).
  Refazer com ambiente **CredFácil** (parede com a logo CredFácil, crachá CredFácil), mantendo uma
  atendente simpática e profissional (mulher, blazer). Pode gerar imagem nova com a logo de referência.
- Áudios `audio/audio-1/2/3.mp3`: conferir se falam "Super Sim"; se falarem, redublar só a palavra.

## 6. Rastreamento (NÃO inventar IDs)
Pixel A/B, `data-ws` e as 5 chaves de env são da SuperSim. Para a CredFácil rodar de verdade sem
misturar venda, o Kauã troca esses IDs/chaves no deploy. **Não inventar pixel/token/CNPJ.** Localmente
o rastreio só não registra — tudo bem. Deixar o CÓDIGO como está; é config de deploy.

## 7. Rodar LOCAL (teste)
```
cd Downloads/CredFacil-funil && npm i && node server.js   # porta 3000  → http://127.0.0.1:3000/
```
Páginas: `/1`…`/9`, `/analise-ia`, `/up1`…`/up12`, `/downsell/*`. A "conversa" com a atendente é
`/analise-ia`. (Se `npm i` do geoip-lite demorar, dá pra servir só `public/` com qualquer http server
estático pra conferir visual, mas o server.js é o caminho real.)

## 8. Dono de cada arquivo (pra rodar em paralelo sem conflito)
- **Identidade (Paleta):** `public/images/credfacil-logo.*`, `credfacil-icon.png`, `favicon-credfacil.png`,
  `menina-credfacil.png` (images + raiz), `cf-emp.png`/`cf-inv.png` (raiz). Remove os antigos de imagem.
- **Render (vídeo atendente):** `videos/video-credfacil-1.mp4` (+poster), `images/atendente-credfacil.png`, `audio/*`.
- **Corta (demais vídeos):** `videos/{vsl-nova,credfacil-apresentacao,apresentacao,timeline-pix}.mp4` + `videos/depoimentos/*`.
- **Tela (rebrand):** TODOS os `*.html`, `css/*.css`, `js/*.js` (texto, cores, refs de arquivo, CNPJ).
- **Vista (QA):** só LÊ; sobe o site local e confere. Não edita.
