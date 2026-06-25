# Dark Hub 2 — Plano Mestre

> Reconstrução limpa do Dark Hub. App desktop instalável, capaz de tudo,
> com o **Radar de Shorts Virais** como coração do sistema.
> Documento vivo — evolui conforme decidimos cada parte.

Data de início do plano: 2026-06-24

---

## 1. Visão

Central única para gestão de canais "dark" (faceless). Reúne:

- **Radar** de shorts virais "fora da curva" (foco principal, deve ser fortíssimo)
- **Sons** (biblioteca com preview, categorias, download)
- **Anotações**
- **Horários do mundo** (saber quando postar)
- **Canais** (adicionar/remover, abrir Studio, idade do canal em dias)
- **Controle de Posts** (painel fixo, sempre visível, com timer por canal)

Princípios: sem bagunça, modular, uma coisa de cada vez com perfeição,
o melhor possível, e preparado para crescer (CapCut, produção, etc.).

---

## 2. Arquitetura (decidida)

```
┌─────────────────────────────────────────────────────────┐
│  Tauri 2 (Rust shell)                                    │
│  - Janela principal + bandeja do sistema (tray)          │
│  - Acesso a arquivos do PC (CapCut, pastas de mídia)     │
│  - Timers/notificações nativas do Controle de Posts      │
│                                                           │
│  ┌──────────────────────┐   ┌────────────────────────┐  │
│  │ UI: React + TS + Vite│←→ │ Motor: Python (FastAPI)│  │
│  │ - Componentes        │   │ "sidecar" empacotado   │  │
│  │ - Estado / rotas      │   │ - Radar (YouTube API)  │  │
│  └──────────────────────┘   │ - Sons / áudio         │  │
│                              │ - CapCut core          │  │
│                              │ - yt-dlp (fallback)    │  │
│                              └───────────┬────────────┘  │
└──────────────────────────────────────────┼──────────────┘
                                            │
                          ┌─────────────────▼────────────────┐
                          │ Cloudflare (sincronização/pesados)│
                          │ - D1 (metadados)                  │
                          │ - R2 (sons/mídia pesada)          │
                          │ - Worker (upload/stream/backup)   │
                          └───────────────────────────────────┘
```

**Camadas:**
- **Local (SQLite)**: cache rápido + dados de trabalho offline.
- **Cloud (D1/R2)**: fonte de verdade sincronizável + arquivos pesados.
- Estratégia híbrida: escreve local → sincroniza com a nuvem.

### Portabilidade ("formatar o PC e trazer tudo de volta") — PRIORIDADE ALTA
Duas pernas, ambas necessárias:
1. **Código** → repositório Git (já versionado localmente; falta um remoto
   GitHub privado para ficar fora da máquina).
2. **Dados** (acervo, histórico, configurações + futuros canais/sons/anotações):
   - [x] **Motor de backup/restauração por arquivo** (`/api/backup/*` + módulo
     "Nuvem" na UI): exporta um snapshot .json de tudo e restaura, com backup
     de segurança automático antes de sobrescrever. Round-trip testado.
     Já garante o cenário "formatei → restaurei" se guardar o arquivo.
   - [ ] **Sincronização automática Cloudflare** (perna 2): empurrar/puxar o
     snapshot para D1/R2 (recursos NOVOS; usuário tem conta). Reaproveita o
     mesmo `export_snapshot()/import_snapshot()`.

**Stack confirmada:**
- Shell: Tauri 2 (Rust)
- UI: React 18 + TypeScript + Vite
- Motor: Python 3 + FastAPI, empacotado com PyInstaller como sidecar
- Cloud: Cloudflare D1 + R2 + Workers (reaproveita o `cloud/` atual)

**Decisões confirmadas:**
- [x] Shell: **Tauri** (confirmado)
- [x] UI: **React + TypeScript + Vite + Tailwind + shadcn/ui** (visual novo)

**Pendências de ambiente (Windows):**
- [ ] Instalar Rust (rustup) — falta
- [ ] Instalar C++ Build Tools (MSVC) — falta, precisa de admin/UAC
- WebView2 já presente; Node 24 e Python 3.11 prontos
- Estratégia: construir o núcleo (UI + motor Python) primeiro, que é
  independente do shell; encaixar o Tauri por cima quando o Rust estiver pronto.

**Decisões em aberto:**
- [ ] Estratégia exata de quota da YouTube API (ver seção 5)

---

## 3. Modelo de dados (rascunho)

Entidades principais (em D1, espelhadas em SQLite local):

- **channel**: id, nome, youtube_channel_id, url_studio, criado_em,
  primeiro_video_em (para idade), nicho, ativo
- **post_slot**: channel_id, horário_alvo, dias_semana, postado_hoje(bool),
  ultimo_post_em  → alimenta o painel fixo de Controle de Posts
- **sound**: id, nome, categoria/coleção, tags, favorito, r2_key,
  duração, tamanho, criado_em
- **note**: id, título, corpo, tags, atualizado_em
- **radar_run**: id, query, filtros, provider, resultados(json), criado_em
- **radar_video_snapshot**: video_id, first_seen, last_seen, views,
  sample_count  → para VPH real / "fora da curva" ao longo do tempo
- **radar_outlier**: video_id, channel_id, multiplier, score, salvo_em
  → banco próprio de outliers que cresce com o uso
- **settings**: youtube_api_key, fusos favoritos, etc.

---

## 4. Módulos (especificação resumida)

### 4.1 Radar (PRIORIDADE 1 — ver seção 5 detalhada)
Busca shorts virais fora da curva via YouTube Data API.

### 4.2 Sons  ✅ FEITO
- Upload (multipart, ≤50MB, só áudio), categorias, tags, favoritos
- Busca/filtro, preview com player HTML5, download, remover
- Arquivos em motor/data/sounds/; metadados no SQLite (no backup)
- Cloud R2 para arquivos pesados: fase posterior (os áudios em si ainda
  não entram no backup .json — só os metadados)

### 4.3 Anotações  ✅ FEITO
- CRUD (lista + editor) com autosave (debounce); incluído no backup

### 4.4 Horários do mundo  ✅ FEITO
- Relógios ao vivo dos principais mercados (12 países), dia/noite, offset
- Simulador "se eu postar às X aqui, que horas sai lá" (com virada de dia)
- Marcadores de janela: horário nobre / almoço / madrugada
- 100% frontend (fusos do navegador), sem backend

### 4.5 Canais  ✅ FEITO
- Adicionar/editar/remover; nicho
- Botão "Abrir Studio" (ID UC… extraído da URL → studio.youtube.com/channel/ID)
- **Contador de vida**: dias desde o 1º vídeo; incluído no backup

### 4.6 Controle de Posts (painel fixo)  ✅ FEITO
- Painel fixo à direita, sempre visível, colapsável (estado no localStorage)
- Por canal (puxa de Canais): horários-alvo, countdown ao vivo
  ("falta XhYm" / "atrasado"), marcar "postei hoje" (verde), adicionar/remover
- Reset diário automático (posted = última data postada == hoje)
- Incluído no backup (post_slots)
- [ ] Pendente: notificação nativa quando chega o horário (via Tauri)

---

## 5. Radar — o coração (como torná-lo fortíssimo)

Fonte de dados escolhida: **YouTube Data API** (oficial, precisa).

### Problemas do Radar atual a resolver
1. Quota frágil (search.list custa 100 unidades; estoura rápido).
2. "Fora da curva" depende de snapshots acumulados — fraco na 1ª busca.
3. Heurística fixa, sem aprender o que VOCÊ acha bom.

### Melhorias-chave da v2
1. **Gestor de quota**: rastreia unidades usadas no dia (10.000 grátis).
   - `search.list` = 100 un. → minimizar.
   - `videos.list` / `channels.list` = 1 un. → usar à vontade.
   - Estratégia adapta profundidade ao orçamento restante.
2. **Detecção de outlier sem depender de histórico**: na própria busca já
   buscamos `channels.list` → calculamos
   **multiplier = views_do_video / média_de_views_do_canal** (ou / inscritos).
   Vídeo "fora da curva" = multiplier alto mesmo em canal pequeno.
   Funciona já na 1ª busca.
3. **Banco de outliers próprio (D1)**: todo outlier forte é salvo e cresce
   com o tempo, virando seu acervo pessoal de referências.
4. **Cache agressivo em D1**: evita requeries e economiza quota.
5. **Personalização**: você marca exemplos "bons/ruins"; o score aprende
   seus pesos (fase posterior).
6. **Snapshots para VPH real** mantidos (igual atual), mas como reforço,
   não como dependência.

### Score (proposto)
- **Viral score** = percentil(alcance) + percentil(VPH) + frescor
- **Outlier multiplier** = views / baseline do canal (NOVO destaque)
- **Oportunidade** = viral + remixabilidade + canal-pequeno + frescor
- Modos de garimpo (early / balanced / safe) mantidos

---

## 6. Roadmap (uma coisa de cada vez, com perfeição)

**Fase 0 — Fundação**  ← EM ANDAMENTO
- [x] Esqueleto UI (React 19 + TS + Vite 8 + Tailwind 4), tema escuro, alias `@/`
- [x] Motor Python (FastAPI) com `/api/health`, venv + deps
- [x] UI ↔ motor conectados (proxy `/api`, badge "motor online")
- [x] Layout principal + sidebar dos módulos
- [x] SQLite local (motor/data/dark_hub.db)
- [x] Encaixar shell Tauri (Rust instalado; app desktop com auto-start do motor)
- [ ] Empacotar motor como sidecar (PyInstaller) + gerar instalador .exe
- [ ] Bandeja do sistema (Tauri) para o Controle de Posts
- [ ] Base do Worker Cloudflare + sincronização de dados (portabilidade)

**Fase 1 — Radar (foco)**  ← EM ANDAMENTO
- [x] Gestor de quota + busca YouTube API (search.list barato, enriquecimento)
- [x] Detecção de outlier por multiplier (views ÷ baseline do canal)
- [x] Scoring (viral + outlier + remix + canal pequeno + modos de garimpo)
- [x] UI de resultados (busca, filtros, quota, resumo, cards)
- [x] Histórico de buscas (radar_runs) + UI dropdown + reabrir sem gastar quota
- [x] Acervo de outliers (radar_outliers) + salvar/remover + aba "Acervo"
- [x] Ordenação (oportunidade/multiplier/views/VPH/recência) + filtro "máx. inscritos"
- [x] Painel de detalhe do vídeo (métricas completas + decomposição do score + ações)
- [x] Modo "Ranking geral" (descobrir virais sem digitar tema) — achou outlier de 278x
- [x] Insights: "Temas em alta" (nuvem de palavras clicável) + "Canais reveladores"
- [x] Configurar chave da API pela interface (engrenagem)
- [ ] "Copiar ideia" virar envio direto para Anotações (quando o módulo existir)
- [ ] Snapshots de VPH real reforçando o score ao longo do tempo (backend já grava)
- [ ] Encaixar Tauri (Rust já instalado) — empacotar como app desktop

**Fase 2 — Canais + Controle de Posts**
- CRUD de canais, idade, botão Studio
- Painel fixo com timers + notificações

**Fase 3 — Sons**
- Biblioteca, preview, download, cloud R2

**Fase 4 — Anotações + Horários do mundo**

**Fase 5+ — Extras** (CapCut drafts, produção SRT, etc.)

> Cada fase só começa quando a anterior estiver redonda.

---

## 7. Decisões registradas

- Reconstrução do zero em `dark_hub2` (app atual = referência)
- Radar é o foco; fonte = YouTube Data API
- Cloud (Cloudflare) desde o início
- Stack: Tauri + React/TS + Python sidecar (recomendação, a confirmar)
