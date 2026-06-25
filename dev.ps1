# Dark Hub 2 — sobe o motor Python e a UI juntos (modo desenvolvimento).
# Uso: clique direito > "Executar com PowerShell", ou:  ./dev.ps1
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

Write-Host "Dark Hub 2 - iniciando ambiente de desenvolvimento..." -ForegroundColor Cyan

# Motor Python (FastAPI) na porta 8077
$motorPy = Join-Path $root "motor\.venv\Scripts\python.exe"
Start-Process -FilePath $motorPy `
  -ArgumentList "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8077", "--reload" `
  -WorkingDirectory (Join-Path $root "motor")

# UI (Vite) na porta 5180
Start-Process -FilePath "npm" -ArgumentList "run", "dev" `
  -WorkingDirectory (Join-Path $root "ui")

Start-Sleep -Seconds 2
Write-Host "Motor:  http://127.0.0.1:8077/api/health" -ForegroundColor Green
Write-Host "UI:     http://127.0.0.1:5180" -ForegroundColor Green
