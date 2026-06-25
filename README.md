# Dark Hub 2

Central de gestão de canais "dark" (faceless). App desktop, com o **Radar de
shorts virais** como foco. Reconstrução limpa do Dark Hub.

> Plano completo e roadmap: [PLAN.md](PLAN.md)

## Estrutura

```
dark_hub2/
  ui/      → UI (React + TypeScript + Vite + Tailwind). Futuro host do Tauri.
  motor/   → Motor Python (FastAPI): Radar, sons, CapCut, yt-dlp.
  PLAN.md  → Plano mestre (documento vivo).
  dev.ps1  → Sobe motor + UI juntos (desenvolvimento).
```

## Rodar em desenvolvimento

Pré-requisitos: Node 18+, Python 3.11+.

```powershell
./dev.ps1
```

Ou manualmente, em dois terminais:

```powershell
# Motor (porta 8077)
cd motor
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8077 --reload
```

```powershell
# UI (porta 5180)
cd ui
npm run dev
```

A UI faz proxy de `/api` para o motor. Abra http://127.0.0.1:5180.

## Status

**Fase 0 — Fundação** (em andamento): esqueleto UI + motor + saúde conectada.
Próxima: encaixar o shell Tauri (precisa de Rust + C++ Build Tools) e começar
a **Fase 1 — Radar**.
