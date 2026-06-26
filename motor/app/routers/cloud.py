"""Endpoints de sincronização com a nuvem (Cloudflare)."""
from __future__ import annotations

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .. import cloud

router = APIRouter()


class CloudConfigBody(BaseModel):
    url: str
    token: str


@router.get("/config")
def get_config():
    return cloud.get_config()


@router.put("/config")
def set_config(body: CloudConfigBody):
    if not body.url.strip() or not body.token.strip():
        raise HTTPException(400, "Informe a URL e o token da nuvem.")
    cloud.set_config(body.url, body.token)
    return cloud.status()


@router.get("/status")
def status():
    return cloud.status()


@router.post("/push")
def push():
    try:
        return cloud.push()
    except cloud.CloudNotConfigured as error:
        raise HTTPException(400, str(error)) from error
    except ValueError as error:
        raise HTTPException(409, str(error)) from error
    except httpx.HTTPError as error:
        raise HTTPException(502, f"Falha ao enviar para a nuvem: {error}") from error


@router.post("/pull")
def pull():
    try:
        return cloud.pull()
    except cloud.CloudNotConfigured as error:
        raise HTTPException(400, str(error)) from error
    except ValueError as error:
        raise HTTPException(404, str(error)) from error
    except httpx.HTTPError as error:
        raise HTTPException(502, f"Falha ao trazer da nuvem: {error}") from error
