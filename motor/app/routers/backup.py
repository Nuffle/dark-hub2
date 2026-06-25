"""Endpoints de backup/restauração (portabilidade local)."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .. import backup

router = APIRouter()


class ImportBody(BaseModel):
    snapshot: dict[str, Any]


@router.get("/summary")
def summary():
    return backup.summary()


@router.get("/export")
def export():
    return backup.export_snapshot()


@router.post("/import")
def import_backup(body: ImportBody):
    try:
        return backup.import_snapshot(body.snapshot)
    except ValueError as error:
        raise HTTPException(400, str(error)) from error
