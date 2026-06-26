# Publica uma nova versão do Dark Hub (instalador assinado + manifesto do updater).
#
# Antes de rodar:
#  1. Suba a versão em ui/src-tauri/tauri.conf.json ("version": "X.Y.Z").
#  2. Tenha a chave privada em %USERPROFILE%\.tauri\dark-hub2.key (já gerada).
#  3. O endpoint em tauri.conf.json deve apontar para o seu repo.
#
# Uso:  ./publicar.ps1 -Repo "Nuffle/dark-hub2"
#
# Obs.: não usamos ErrorActionPreference=Stop porque PyInstaller/cargo logam no
# stderr (o PowerShell trataria como erro fatal). Checamos $LASTEXITCODE.
param(
  [Parameter(Mandatory = $true)][string]$Repo
)
$root = $PSScriptRoot
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"

# Chave de assinatura (a privada NUNCA vai para o Git).
# O bundler do Tauri lê o CONTEÚDO da chave em TAURI_SIGNING_PRIVATE_KEY.
$keyPath = Join-Path $env:USERPROFILE ".tauri\dark-hub2.key"
$passPath = Join-Path $env:USERPROFILE ".tauri\dark-hub2.pass"
if (-not (Test-Path $keyPath)) { Write-Host "Chave de assinatura nao encontrada em $keyPath" -ForegroundColor Red; exit 1 }
if (-not (Test-Path $passPath)) { Write-Host "Senha da chave nao encontrada em $passPath" -ForegroundColor Red; exit 1 }
$env:TAURI_SIGNING_PRIVATE_KEY = (Get-Content $keyPath -Raw).Trim()
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = (Get-Content $passPath -Raw).Trim()

Write-Host "1/3 Recompilando o motor (sidecar)..." -ForegroundColor Cyan
& (Join-Path $root "motor\build_motor.ps1")
if ($LASTEXITCODE -ne 0) { Write-Host "Build do motor falhou." -ForegroundColor Red; exit 1 }
Copy-Item (Join-Path $root "motor\dist\motor.exe") `
  (Join-Path $root "ui\src-tauri\binaries\motor-x86_64-pc-windows-msvc.exe") -Force

Write-Host "2/3 Compilando o app + instalador assinado..." -ForegroundColor Cyan
Set-Location (Join-Path $root "ui")
npx tauri build
if ($LASTEXITCODE -ne 0) { Write-Host "tauri build falhou." -ForegroundColor Red; exit 1 }

# Versão atual
$conf = Get-Content (Join-Path $root "ui\src-tauri\tauri.conf.json") -Raw | ConvertFrom-Json
$version = $conf.version
$nsisDir = Join-Path $root "ui\src-tauri\target\release\bundle\nsis"
$setup = Get-ChildItem $nsisDir -Filter "*-setup.exe" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
$sigFile = "$($setup.FullName).sig"
$signature = (Get-Content $sigFile -Raw).Trim()

# GitHub troca espaços por pontos no nome do arquivo da release.
$assetName = ($setup.Name -replace ' ', '.')
$downloadUrl = "https://github.com/$Repo/releases/download/v$version/$assetName"

$manifest = [ordered]@{
  version   = $version
  notes     = "Atualizacao do Dark Hub $version"
  pub_date  = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  platforms = @{
    "windows-x86_64" = [ordered]@{ signature = $signature; url = $downloadUrl }
  }
}
$latestPath = Join-Path $nsisDir "latest.json"
$manifest | ConvertTo-Json -Depth 6 | Set-Content $latestPath -Encoding utf8

$tag = "v" + $version
Write-Host "3/3 Pronto!" -ForegroundColor Green
Write-Host "Crie uma GitHub Release com a tag $tag e suba estes 2 arquivos:" -ForegroundColor Yellow
Write-Host "  - $($setup.FullName)"
Write-Host "  - $latestPath"
exit 0
