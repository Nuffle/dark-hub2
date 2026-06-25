"""Canais do usuário — CRUD, link do Studio e idade do canal."""
from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from .. import db

router = APIRouter()


class ChannelBody(BaseModel):
    name: str = Field(min_length=1)
    channel_id: str = ""
    url: str = ""
    yt_schedule_url: str = ""
    first_video_date: str = ""  # AAAA-MM-DD
    niche: str = ""


def _now() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def _extract_channel_id(value: str) -> str:
    """Extrai o ID UC... de uma URL de canal, se houver."""
    match = re.search(r"(UC[\w-]{20,})", value or "")
    return match.group(1) if match else ""


def _decorate(row: dict) -> dict:
    item = dict(row)
    cid = item.get("channel_id") or ""
    item["studio_url"] = (
        f"https://studio.youtube.com/channel/{cid}" if cid else "https://studio.youtube.com"
    )
    age = None
    fvd = item.get("first_video_date") or ""
    if fvd:
        try:
            start = datetime.fromisoformat(fvd).date()
            age = (datetime.now(timezone.utc).date() - start).days
        except ValueError:
            age = None
    item["age_days"] = age
    return item


@router.get("")
def list_channels():
    with db.connect() as connection:
        rows = connection.execute("SELECT * FROM channels ORDER BY created_at").fetchall()
    return [_decorate(dict(row)) for row in rows]


@router.post("")
def create_channel(body: ChannelBody):
    channel_id = body.channel_id.strip() or _extract_channel_id(body.url)
    new_id = str(uuid.uuid4())
    with db.connect() as connection:
        connection.execute(
            """
            INSERT INTO channels (
                id, name, channel_id, url, yt_schedule_url,
                first_video_date, niche, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                new_id,
                body.name.strip(),
                channel_id,
                body.url.strip(),
                body.yt_schedule_url.strip(),
                body.first_video_date.strip(),
                body.niche.strip(),
                _now(),
            ),
        )
        row = connection.execute("SELECT * FROM channels WHERE id = ?", (new_id,)).fetchone()
    return _decorate(dict(row))


@router.put("/{channel_id}")
def update_channel(channel_id: str, body: ChannelBody):
    cid = body.channel_id.strip() or _extract_channel_id(body.url)
    with db.connect() as connection:
        exists = connection.execute("SELECT 1 FROM channels WHERE id = ?", (channel_id,)).fetchone()
        if not exists:
            raise HTTPException(404, "Canal não encontrado.")
        connection.execute(
            """
            UPDATE channels
            SET name = ?, channel_id = ?, url = ?, yt_schedule_url = ?, first_video_date = ?, niche = ?
            WHERE id = ?
            """,
            (
                body.name.strip(),
                cid,
                body.url.strip(),
                body.yt_schedule_url.strip(),
                body.first_video_date.strip(),
                body.niche.strip(),
                channel_id,
            ),
        )
        row = connection.execute("SELECT * FROM channels WHERE id = ?", (channel_id,)).fetchone()
    return _decorate(dict(row))


@router.delete("/{channel_id}")
def delete_channel(channel_id: str):
    with db.connect() as connection:
        connection.execute("DELETE FROM channels WHERE id = ?", (channel_id,))
    return {"deleted": channel_id}
