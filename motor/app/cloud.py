"""Cliente de sincronização com a nuvem (Cloudflare Worker).

Empurra/puxa o snapshot completo (mesmo do backup) para o D1 via /api/state,
e lê uso/limites via /api/sounds. As travas de custo são aplicadas no próprio
Worker (ele recusa com 429/409/413 ao atingir os limites grátis).
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path

import httpx

from . import backup, db, settings_store

CLOUD_DIR = Path(__file__).resolve().parent.parent.parent / "cloud"
SOUNDS_DIR = db.DATA_DIR / "sounds"
TIMEOUT = 30.0
MEDIA_TIMEOUT = 180.0

_MIME = {
    "mp3": "audio/mpeg", "wav": "audio/wav", "ogg": "audio/ogg",
    "m4a": "audio/mp4", "aac": "audio/aac", "flac": "audio/flac", "opus": "audio/opus",
}


class CloudNotConfigured(Exception):
    pass


def _now() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def _bootstrap_from_files() -> None:
    # Conveniência em dev: se ainda não há config salva, importa a URL e o token
    # gerados pelo configurar_cloud.ps1 (cloud/.cloud-url e cloud/.cloud-token).
    if settings_store.get("cloud_url"):
        return
    url_file = CLOUD_DIR / ".cloud-url"
    token_file = CLOUD_DIR / ".cloud-token"
    try:
        if url_file.exists() and token_file.exists():
            url = url_file.read_text(encoding="utf-8").strip()
            token = token_file.read_text(encoding="utf-8").strip()
            if url and token:
                settings_store.set("cloud_url", url.rstrip("/"))
                settings_store.set("cloud_token", token)
    except OSError:
        pass


def get_config() -> dict:
    _bootstrap_from_files()
    url = settings_store.get("cloud_url")
    token = settings_store.get("cloud_token")
    return {"configured": bool(url and token), "url": url}


def set_config(url: str, token: str) -> None:
    settings_store.set("cloud_url", url.strip().rstrip("/"))
    settings_store.set("cloud_token", token.strip())


def _auth() -> tuple[str, dict[str, str]]:
    _bootstrap_from_files()
    url = (settings_store.get("cloud_url") or "").rstrip("/")
    token = settings_store.get("cloud_token") or ""
    if not url or not token:
        raise CloudNotConfigured("Nuvem não configurada. Salve a URL e o token.")
    return url, {"Authorization": f"Bearer {token}"}


def status() -> dict:
    cfg = get_config()
    if not cfg["configured"]:
        return {"configured": False, "connected": False}
    url, headers = _auth()
    out: dict = {"configured": True, "connected": False, "url": url}
    try:
        with httpx.Client(timeout=TIMEOUT) as client:
            state = client.get(f"{url}/api/state/status", headers=headers)
            state.raise_for_status()
            data = state.json()
            out["connected"] = True
            out["revision"] = data.get("revision", 0)
            out["remote_updated_at"] = data.get("updated_at", "")
            out["remote_size_bytes"] = data.get("size_bytes", 0)
            usage = client.get(f"{url}/api/sounds", headers=headers)
            if usage.is_success:
                out["usage"] = usage.json().get("usage")
    except httpx.HTTPError as error:
        out["error"] = str(error)
    return out


def push() -> dict:
    url, headers = _auth()
    # Os metadados de som vão pelo /api/sounds (R2), não no snapshot, para não
    # duplicar — o snapshot leva todo o resto.
    snapshot = backup.export_snapshot(exclude={"sounds"})
    with httpx.Client(timeout=TIMEOUT) as client:
        response = client.put(
            f"{url}/api/state/snapshot", headers=headers, json={"snapshot": snapshot}
        )
        if response.status_code in (413, 429):
            raise ValueError(_message(response))
        response.raise_for_status()
        result = response.json()
    uploaded, failed = _push_sounds(url, headers)
    result["sounds_uploaded"] = uploaded
    result["sounds_failed"] = failed
    return result


def pull() -> dict:
    url, headers = _auth()
    with httpx.Client(timeout=TIMEOUT) as client:
        response = client.get(f"{url}/api/state/snapshot", headers=headers)
        response.raise_for_status()
        data = response.json()
    if not data.get("exists") or not data.get("snapshot"):
        raise ValueError("Ainda não há backup na nuvem.")
    result = backup.import_snapshot(data["snapshot"])
    result["sounds_downloaded"] = _pull_sounds(url, headers)
    return result


def _push_sounds(url: str, headers: dict[str, str]) -> tuple[int, int]:
    """Sobe os arquivos de som que ainda não estão na nuvem (cloud_id vazio)."""
    with db.connect() as connection:
        pending = [
            dict(row)
            for row in connection.execute(
                "SELECT * FROM sounds WHERE cloud_id = '' OR cloud_id IS NULL"
            ).fetchall()
        ]
    uploaded = 0
    failed = 0
    with httpx.Client(timeout=MEDIA_TIMEOUT) as client:
        for sound in pending:
            path = SOUNDS_DIR / f"{sound['id']}.{sound['ext']}"
            if not path.exists():
                continue
            tags = [t.strip() for t in (sound.get("tags") or "").split(",") if t.strip()]
            try:
                files = {
                    "file": (
                        f"{sound['name'] or sound['id']}.{sound['ext']}",
                        path.read_bytes(),
                        _MIME.get(sound["ext"], "application/octet-stream"),
                    )
                }
                data = {
                    "name": sound["name"] or sound["id"],
                    "category": sound.get("category") or "",
                    "tags": json.dumps(tags),
                }
                response = client.post(
                    f"{url}/api/sounds/upload", headers=headers, files=files, data=data
                )
                if response.status_code in (409, 413, 429):
                    failed += 1
                    continue
                response.raise_for_status()
                cloud_id = response.json().get("id")
                with db.connect() as connection:
                    connection.execute(
                        "UPDATE sounds SET cloud_id = ? WHERE id = ?", (cloud_id, sound["id"])
                    )
                uploaded += 1
            except httpx.HTTPError:
                failed += 1
    return uploaded, failed


def _pull_sounds(url: str, headers: dict[str, str]) -> int:
    """Baixa os sons da nuvem que ainda não existem localmente."""
    SOUNDS_DIR.mkdir(parents=True, exist_ok=True)
    with db.connect() as connection:
        known = {
            row["cloud_id"]
            for row in connection.execute(
                "SELECT cloud_id FROM sounds WHERE cloud_id != ''"
            ).fetchall()
        }
    downloaded = 0
    with httpx.Client(timeout=MEDIA_TIMEOUT) as client:
        listing = client.get(f"{url}/api/sounds", headers=headers)
        listing.raise_for_status()
        for cloud in listing.json().get("sounds", []):
            if cloud["id"] in known:
                continue
            ext = (cloud.get("object_key") or "").rsplit(".", 1)[-1].lower() or "mp3"
            download_url = cloud.get("download_url") or ""
            if not download_url:
                continue
            try:
                media = client.get(f"{url}/api{download_url}", headers=headers)
                media.raise_for_status()
            except httpx.HTTPError:
                continue
            new_id = str(uuid.uuid4())
            (SOUNDS_DIR / f"{new_id}.{ext}").write_bytes(media.content)
            tags = cloud.get("tags") or []
            tags_str = ", ".join(tags) if isinstance(tags, list) else str(tags)
            with db.connect() as connection:
                connection.execute(
                    """
                    INSERT INTO sounds (
                        id, name, category, tags, favorite, filename, ext,
                        size_bytes, duration_seconds, created_at, cloud_id
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        new_id,
                        cloud.get("name") or "Som",
                        cloud.get("category") or "",
                        tags_str,
                        1 if cloud.get("favorite") else 0,
                        cloud.get("original_name") or f"{new_id}.{ext}",
                        ext,
                        int(cloud.get("size") or 0),
                        float(cloud.get("duration") or 0),
                        cloud.get("created_at") or _now(),
                        cloud["id"],
                    ),
                )
            downloaded += 1
    return downloaded


def _message(response: httpx.Response) -> str:
    try:
        return str(response.json().get("detail") or response.text)
    except ValueError:
        return response.text or f"Erro {response.status_code}"
