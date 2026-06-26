# Publica uma nova versão do Dark Hub (instalador assinado + manifesto do updater).
#
# Antes de rodar:
#  1. Suba a versão em ui/src-tauri/tauri.conf.json ("version": "X.Y.Z").
#  2. Tenha a chave privada em %USERPROFILE%\.tauri\dark-hub2.key (já gerada).
#  3. Edite o endpoint em tauri.conf.json trocando SEU_USUARIO pelo seu GitHub.
#
# Uso:  ./publicar.ps1 -Repo "seu-usuario/dark-hub2"
param(
  [Parameter(Mandatory = $true)][string]$Repo
)
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"

# Chave de assinatura (a privada NUNCA vai para o Git).
$env:TAURI_SIGNING_PRIVATE_KEY_PATH = Join-Path $env:USERPROFILE ".tauri\dark-hub2.key"
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ""

Write-Host "1/3 Recompilando o motor (sidecar)..." -ForegroundColor Cyan
& (Join-Path $root "motor\build_motor.ps1")
Copy-Item (Join-Path $root "motor\dist\motor.exe") `
  (Join-Path $root "ui\src-tauri\binaries\motor-x86_64-pc-windows-msvc.exe") -Force

Write-Host "2/3 Compilando o app + instalador assinado..." -ForegroundColor Cyan
Set-Location (Join-Path $root "ui")
npx tauri build

# Versão atual
$conf = Get-Content (Join-Path $root "ui\src-tauri\tauri.conf.json") -Raw | ConvertFrom-Json
$version = $conf.version
$nsisDir = Join-Path $root "ui\src-tauri\target\release\bundle\nsis"
$setup = Get-ChildItem $nsisDir -Filter "*-setup.exe" | Select-Object -First 1
$sigFile = "$($setup.FullName).sig"
$signature = Get-Content $sigFile -Raw

# GitHub troca espaços por pontos no nome do arquivo da release.
$assetName = ($setup.Name -replace ' ', '.')
$downloadUrl = "https://github.com/$Repo/releases/download/v$version/$assetName"

$manifest = [ordered]@{
  version   = $version
  notes     = "Atualização do Dark Hub $version"
  pub_date  = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  platforms = @{
    "windows-x86_64" = @{ signature = $signature.Trim(); url = $downloadUrl }
  }
}
$latestPath = Join-Path $nsisDir "latest.json"
$manifest | ConvertTo-Json -Depth 6 | Set-Content $latestPath -Encoding utf8

Write-Host "3/3 Pronto!" -ForegroundColor Green
Write-Host "Suba estes 2 arquivos numa GitHub Release com a tag v$version:" -ForegroundColor Yellow
Write-Host "  - $($setup.FullName)"
Write-Host "  - $latestPath"
