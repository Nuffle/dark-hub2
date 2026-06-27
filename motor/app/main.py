"""Dark Hub 2 — motor Python (FastAPI).

Núcleo de processamento pesado: Radar (YouTube API), sons/áudio, CapCut,
yt-dlp. Roda como serviço local; em produção será empacotado como sidecar
do app Tauri.
"""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import db
from .routers import backup, channels, cloud, notes, posts, radar, sounds

VERSION = "0.1.4"

db.initialize()

app = FastAPI(title="Dark Hub Motor", version=VERSION)

# O motor escuta só em 127.0.0.1 (não exposto à rede). O webview do Tauri em
# produção usa origens variadas (http(s)://tauri.localhost no Windows,
# tauri://localhost em outros), e em dev é localhost:5180. Liberar todas as
# origens é seguro aqui porque o serviço é loopback-only e sem cookies/credenciais.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(radar.router, prefix="/api/radar", tags=["radar"])
app.include_router(channels.router, prefix="/api/channels", tags=["channels"])
app.include_router(notes.router, prefix="/api/notes", tags=["notes"])
app.include_router(posts.router, prefix="/api/posts", tags=["posts"])
app.include_router(sounds.router, prefix="/api/sounds", tags=["sounds"])
app.include_router(backup.router, prefix="/api/backup", tags=["backup"])
app.include_router(cloud.router, prefix="/api/cloud", tags=["cloud"])


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "dark-hub-motor", "version": VERSION}
