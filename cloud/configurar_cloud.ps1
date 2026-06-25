# Dark Hub 2 — configuração guiada do Cloudflare (D1 + R2 + Worker).
# Cria recursos NOVOS e limpos, aplica migrações, gera o token e faz o deploy.
# Uso: clique direito > "Executar com PowerShell" nesta pasta (cloud/).
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

function Step($msg) { Write-Host "`n=== $msg ===" -ForegroundColor Cyan }

Step "1/7 Instalando dependências (wrangler)"
npm install

Step "2/7 Login na sua conta Cloudflare (abre o navegador)"
npx wrangler login

Step "3/7 Criando o banco D1 'dark-hub2'"
$create = npx wrangler d1 create dark-hub2 2>&1 | Out-String
Write-Host $create
$dbId = [regex]::Match($create, '"?database_id"?\s*[:=]\s*"([0-9a-fA-F-]{36})"').Groups[1].Value
if (-not $dbId) {
  Write-Host "Não consegui detectar o database_id automaticamente." -ForegroundColor Yellow
  $dbId = Read-Host "Cole o database_id que apareceu acima"
}
# grava o id no wrangler.jsonc
$cfgPath = Join-Path $PSScriptRoot "wrangler.jsonc"
$cfg = Get-Content $cfgPath -Raw
$cfg = $cfg -replace "PREENCHER_AO_CRIAR", $dbId
Set-Content -Path $cfgPath -Value $cfg -Encoding utf8
Write-Host "database_id gravado no wrangler.jsonc: $dbId" -ForegroundColor Green

Step "4/7 Criando o bucket R2 'dark-hub2-sounds'"
try { npx wrangler r2 bucket create dark-hub2-sounds } catch { Write-Host "(bucket pode já existir, seguindo)" -ForegroundColor Yellow }

Step "5/7 Aplicando as migrações do banco (remoto)"
npx wrangler d1 migrations apply dark-hub2 --remote

Step "6/7 Gerando o token de segurança e salvando como secret"
$token = -join ((1..48) | ForEach-Object { '{0:x}' -f (Get-Random -Max 16) })
$token | npx wrangler secret put SOUNDS_API_TOKEN
# guarda o token localmente (NÃO vai pro Git) para o app usar
Set-Content -Path (Join-Path $PSScriptRoot ".cloud-token") -Value $token -Encoding ascii -NoNewline
Write-Host "Token salvo em cloud/.cloud-token" -ForegroundColor Green

Step "7/7 Publicando o Worker"
$deploy = npx wrangler deploy 2>&1 | Out-String
Write-Host $deploy
$workerUrl = [regex]::Match($deploy, "https://[a-z0-9.\-]*workers\.dev").Value
if ($workerUrl) {
  Set-Content -Path (Join-Path $PSScriptRoot ".cloud-url") -Value $workerUrl -Encoding ascii -NoNewline
  Write-Host "`nPRONTO! Worker no ar em: $workerUrl" -ForegroundColor Green
} else {
  Write-Host "`nDeploy concluído. Copie a URL https://...workers.dev que apareceu acima." -ForegroundColor Green
}

Write-Host "`nDados salvos em cloud/.cloud-url e cloud/.cloud-token." -ForegroundColor Cyan
Write-Host "Me avise (ao Claude) quando terminar para eu conectar o app à nuvem." -ForegroundColor Cyan
