"""Cliente de sincronização com a nuvem (Cloudflare Worker).

Empurra/puxa o snapshot completo (mesmo do backup) para o D1 via /api/state,
e lê uso/limites via /api/sounds. As travas de custo são aplicadas no próprio
Worker (ele recusa com 429/409/413 ao atingir os limites grátis).
"""
from __future__ import annotations

from pathlib import Path

import httpx

from . import backup, settings_store

CLOUD_DIR = Path(__file__).resolve().parent.parent.parent / "cloud"
TIMEOUT = 30.0


class CloudNotConfigured(Exception):
    pass


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
    snapshot = backup.export_snapshot()
    with httpx.Client(timeout=TIMEOUT) as client:
        response = client.put(
            f"{url}/api/state/snapshot", headers=headers, json={"snapshot": snapshot}
        )
        if response.status_code in (413, 429):
            raise ValueError(_message(response))
        response.raise_for_status()
        return response.json()


def pull() -> dict:
    url, headers = _auth()
    with httpx.Client(timeout=TIMEOUT) as client:
        response = client.get(f"{url}/api/state/snapshot", headers=headers)
        response.raise_for_status()
        data = response.json()
    if not data.get("exists") or not data.get("snapshot"):
        raise ValueError("Ainda não há backup na nuvem.")
    return backup.import_snapshot(data["snapshot"])


def _message(response: httpx.Response) -> str:
    try:
        return str(response.json().get("detail") or response.text)
    except ValueError:
        return response.text or f"Erro {response.status_code}"
