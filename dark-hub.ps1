# Dark Hub 2 — abre o app desktop (Tauri).
# O Tauri sobe a UI (Vite) e o Rust inicia o motor Python automaticamente.
# Uso: clique direito > "Executar com PowerShell", ou:  ./dark-hub.ps1
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

# Garante o Rust no PATH desta sessão (caso o terminal seja antigo).
$cargoBin = Join-Path $env:USERPROFILE ".cargo\bin"
if (Test-Path $cargoBin) { $env:Path = "$cargoBin;$env:Path" }

Write-Host "Dark Hub - abrindo app desktop (primeira vez compila o Rust, pode demorar)..." -ForegroundColor Cyan
Set-Location (Join-Path $root "ui")
npx tauri dev
