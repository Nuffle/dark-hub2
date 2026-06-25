# Empacota o motor Python num executável standalone (sidecar do Tauri).
# Gera motor/dist/motor.exe. Rode dentro de motor/ com o venv configurado.
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$py = Join-Path $PSScriptRoot ".venv\Scripts\python.exe"

Write-Host "Instalando PyInstaller (se preciso)..." -ForegroundColor Cyan
& $py -m pip install --quiet pyinstaller

Write-Host "Compilando motor.exe..." -ForegroundColor Cyan
& $py -m PyInstaller --noconfirm --onefile --name motor `
  --collect-submodules uvicorn `
  --collect-submodules fastapi `
  --collect-submodules anyio `
  --hidden-import multipart `
  --hidden-import app.main `
  run_motor.py

Write-Host "Pronto: motor\dist\motor.exe" -ForegroundColor Green
