# Dark Hub 2 — Nuvem (Cloudflare)

Worker que sincroniza os dados do app na sua conta Cloudflare:
- **D1** (`app_state`): guarda o snapshot completo dos seus dados (mesmo formato
  do backup local) — push/pull. Também guarda metadados dos sons.
- **R2** (`dark-hub2-sounds`): arquivos de áudio dos sons.
- **Travas de custo**: o Worker recusa operações acima dos limites em
  `wrangler.jsonc` (tamanho de arquivo/snapshot, nº de arquivos, operações
  Class A/B por mês) — protege contra estourar o nível grátis.

## Como publicar (uma vez)

Pré-requisito: ter conta na Cloudflare. O R2 exige um cartão cadastrado
(mesmo no grátis), mas as travas acima evitam cobrança.

```powershell
cd cloud
./configurar_cloud.ps1
```

O script: faz login, cria o banco D1 e o bucket R2 **novos**, aplica as
migrações, gera um token de segurança (salvo em `cloud/.cloud-token`),
publica o Worker e salva a URL em `cloud/.cloud-url`.

Depois disso, avise o Claude para conectar o app à nuvem (motor + interface
de sincronização e avisos de uso).

## Endpoints (usados pelo motor)

- `GET  /api/health` — status.
- `GET  /api/state/status` — metadados do snapshot na nuvem (revisão, tamanho).
- `GET  /api/state/snapshot` — baixa o snapshot completo.
- `PUT  /api/state/snapshot` — envia o snapshot (com limite de tamanho).
- `GET/POST/PATCH/DELETE /api/sounds...` — biblioteca de sons no R2.

Tudo (exceto health e stream de mídia) exige `Authorization: Bearer <token>`.

## Segurança

`.cloud-token` e `.cloud-url` ficam fora do Git (ver `.gitignore`).
O token também é guardado como secret no Worker (`SOUNDS_API_TOKEN`).
