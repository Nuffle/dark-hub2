"""Biblioteca local de sons."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel

from .. import db

router = APIRouter()

SOUNDS_DIR = db.DATA_DIR / "sounds"
SOUNDS_DIR.mkdir(parents=True, exist_ok=True)

MAX_SIZE_BYTES = 50 * 1024 * 1024
CHUNK_SIZE = 1024 * 1024
ALLOWED_EXTENSIONS = {"mp3", "wav", "ogg", "m4a", "aac", "flac"}
MEDIA_TYPES = {
    "mp3": "audio/mpeg",
    "wav": "audio/wav",
    "ogg": "audio/ogg",
    "m4a": "audio/mp4",
    "aac": "audio/aac",
    "flac": "audio/flac",
}


class SoundBody(BaseModel):
    name: str = ""
    category: str = ""
    tags: str = ""
    favorite: bool = False


def _now() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def _media_type(ext: str) -> str:
    return MEDIA_TYPES.get(ext.lower(), "application/octet-stream")


def _file_path(sound_id: str, ext: str) -> Path:
    return SOUNDS_DIR / f"{sound_id}.{ext}"


def _get_sound(sound_id: str) -> dict:
    with db.connect() as connection:
        row = connection.execute("SELECT * FROM sounds WHERE id = ?", (sound_id,)).fetchone()
    if not row:
        raise HTTPException(404, "Som não encontrado.")
    return dict(row)


def _download_name(sound: dict) -> str:
    base = (sound.get("name") or sound.get("filename") or sound["id"]).strip()
    ext = (sound.get("ext") or "").strip(".")
    if not base.lower().endswith(f".{ext}"):
        base = f"{base}.{ext}"
    return base


@router.get("")
def list_sounds():
    with db.connect() as connection:
        rows = connection.execute(
            "SELECT * FROM sounds ORDER BY favorite DESC, created_at DESC"
        ).fetchall()
    return [dict(row) for row in rows]


@router.post("/upload")
async def upload_sound(
    file: UploadFile = File(...),
    name: str = Form(""),
    category: str = Form(""),
    tags: str = Form(""),
):
    original_name = file.filename or ""
    ext = Path(original_name).suffix.lower().lstrip(".")
    if ext not in ALLOWED_EXTENSIONS:
        await file.close()
        raise HTTPException(400, "Formato de áudio não aceito.")

    new_id = str(uuid.uuid4())
    target = _file_path(new_id, ext)
    size = 0

    try:
        with target.open("wb") as output:
            while True:
                chunk = await file.read(CHUNK_SIZE)
                if not chunk:
                    break
                size += len(chunk)
                if size > MAX_SIZE_BYTES:
                    raise HTTPException(400, "Arquivo maior que 50 MB.")
                output.write(chunk)
    except Exception:
        target.unlink(missing_ok=True)
        raise
    finally:
        await file.close()

    display_name = name.strip() or Path(original_name).stem or "Som sem nome"
    with db.connect() as connection:
        try:
            connection.execute(
                """
                INSERT INTO sounds (
                    id, name, category, tags, favorite, filename, ext,
                    size_bytes, duration_seconds, created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    new_id,
                    display_name,
                    category.strip(),
                    tags.strip(),
                    0,
                    original_name,
                    ext,
                    size,
                    0,
                    _now(),
                ),
            )
            row = connection.execute("SELECT * FROM sounds WHERE id = ?", (new_id,)).fetchone()
        except Exception:
            target.unlink(missing_ok=True)
            raise
    return dict(row)


@router.get("/{sound_id}/stream")
def stream_sound(sound_id: str):
    sound = _get_sound(sound_id)
    path = _file_path(sound_id, sound["ext"])
    if not path.exists():
        raise HTTPException(404, "Arquivo de áudio não encontrado.")
    return FileResponse(path, media_type=_media_type(sound["ext"]))


@router.get("/{sound_id}/download")
def download_sound(sound_id: str):
    sound = _get_sound(sound_id)
    path = _file_path(sound_id, sound["ext"])
    if not path.exists():
        raise HTTPException(404, "Arquivo de áudio não encontrado.")
    return FileResponse(path, media_type=_media_type(sound["ext"]), filename=_download_name(sound))


@router.put("/{sound_id}")
def update_sound(sound_id: str, body: SoundBody):
    with db.connect() as connection:
        exists = connection.execute("SELECT 1 FROM sounds WHERE id = ?", (sound_id,)).fetchone()
        if not exists:
            raise HTTPException(404, "Som não encontrado.")
        connection.execute(
            """
            UPDATE sounds
            SET name = ?, category = ?, tags = ?, favorite = ?
            WHERE id = ?
            """,
            (
                body.name.strip(),
                body.category.strip(),
                body.tags.strip(),
                1 if body.favorite else 0,
                sound_id,
            ),
        )
        row = connection.execute("SELECT * FROM sounds WHERE id = ?", (sound_id,)).fetchone()
    return dict(row)


@router.delete("/{sound_id}")
def delete_sound(sound_id: str):
    sound = _get_sound(sound_id)
    path = _file_path(sound_id, sound["ext"])
    with db.connect() as connection:
        connection.execute("DELETE FROM sounds WHERE id = ?", (sound_id,))
    path.unlink(missing_ok=True)
    return {"deleted": sound_id}
