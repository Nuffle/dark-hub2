# Auto-updater — como ativar e publicar versões

O app já vem com o auto-updater embutido: ao abrir, ele checa se há versão nova,
e mostra um aviso "Nova versão disponível" com botão **Atualizar agora** (baixa,
confere a assinatura e reinicia sozinho).

Falta só **ligar a hospedagem** (GitHub) — passos abaixo, uma vez só.

## Setup (uma vez)

1. **Crie um repositório no GitHub** (pode ser privado), ex.: `dark-hub2`.
2. **Envie o código** (na pasta `dark_hub2`):
   ```powershell
   git remote add origin https://github.com/SEU_USUARIO/dark-hub2.git
   git push -u origin main
   ```
3. **Aponte o updater pro seu repo**: em
   `ui/src-tauri/tauri.conf.json`, dentro de `plugins.updater.endpoints`,
   troque `SEU_USUARIO` pelo seu usuário do GitHub.

> A chave de assinatura já foi gerada em `%USERPROFILE%\.tauri\dark-hub2.key`
> (privada — **nunca** suba para o Git) e a pública já está no `tauri.conf.json`.
> Se perder a privada, atualizações deixam de funcionar.

## Publicar uma nova versão (cada vez)

1. Suba o número da versão em `ui/src-tauri/tauri.conf.json` (`"version"`).
2. Rode:
   ```powershell
   ./publicar.ps1 -Repo "SEU_USUARIO/dark-hub2"
   ```
   Isso recompila o motor, gera o instalador **assinado** e cria o `latest.json`.
3. No GitHub, crie uma **Release** com a tag `vX.Y.Z` e suba os 2 arquivos que o
   script indicar (o `*-setup.exe` e o `latest.json`).

Pronto: quem tiver o app instalado recebe o aviso de atualização ao abrir.
