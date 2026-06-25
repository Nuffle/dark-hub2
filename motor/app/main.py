"""Dark Hub 2 — motor Python (FastAPI).

Núcleo de processamento pesado: Radar (YouTube API), sons/áudio, CapCut,
yt-dlp. Roda como serviço local; em produção será empacotado como sidecar
do app Tauri.
"""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import db
from .routers import radar

VERSION = "0.1.0"

db.initialize()

app = FastAPI(title="Dark Hub Motor", version=VERSION)

# Em dev, a UI (Vite) roda em http://127.0.0.1:5180 e faz proxy de /api.
# Mantemos o CORS aberto para o host local por segurança/portabilidade.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5180",
        "http://localhost:5180",
        "tauri://localhost",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(radar.router, prefix="/api/radar", tags=["radar"])


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "dark-hub-motor", "version": VERSION}
