# Empacota o motor Python num executável standalone (sidecar do Tauri).
# Gera motor/dist/motor.exe. Rode dentro de motor/ com o venv configurado.
# NÃO usamos ErrorActionPreference=Stop porque PyInstaller loga no stderr e
# o PowerShell trataria isso como erro fatal. Checamos $LASTEXITCODE em vez disso.
Set-Location $PSScriptRoot

$py = Join-Path $PSScriptRoot ".venv\Scripts\python.exe"

Write-Host "Instalando PyInstaller (se preciso)..." -ForegroundColor Cyan
& $py -m pip install --quiet pyinstaller
if ($LASTEXITCODE -ne 0) { Write-Host "Falha ao instalar PyInstaller." -ForegroundColor Red; exit 1 }

Write-Host "Compilando motor.exe..." -ForegroundColor Cyan
& $py -m PyInstaller --noconfirm --onefile --name motor `
  --collect-submodules uvicorn `
  --collect-submodules fastapi `
  --collect-submodules anyio `
  --hidden-import multipart `
  --hidden-import app.main `
  run_motor.py
if ($LASTEXITCODE -ne 0) { Write-Host "PyInstaller falhou (codigo $LASTEXITCODE)." -ForegroundColor Red; exit 1 }

Write-Host "Pronto: motor\dist\motor.exe" -ForegroundColor Green
exit 0
