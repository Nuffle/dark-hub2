"""Controle de Posts — horários-alvo por canal e marcação de "postei hoje"."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .. import db

router = APIRouter()


class SlotBody(BaseModel):
    channel_id: str
    target_time: str = ""  # "HH:MM"


class SlotUpdate(BaseModel):
    target_time: str = ""


class PostedBody(BaseModel):
    posted: bool


def _now() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def _today() -> str:
    return datetime.now().astimezone().strftime("%Y-%m-%d")


@router.get("")
def list_slots():
    with db.connect() as connection:
        rows = connection.execute(
            """
            SELECT s.*, c.name AS channel_name
            FROM post_slots s
            LEFT JOIN channels c ON c.id = s.channel_id
            ORDER BY c.name, s.target_time
            """
        ).fetchall()
    today = _today()
    return [
        {**dict(row), "posted_today": (row["last_posted_date"] == today)}
        for row in rows
    ]


@router.post("")
def create_slot(body: SlotBody):
    new_id = str(uuid.uuid4())
    with db.connect() as connection:
        channel = connection.execute(
            "SELECT 1 FROM channels WHERE id = ?", (body.channel_id,)
        ).fetchone()
        if not channel:
            raise HTTPException(404, "Canal não encontrado.")
        connection.execute(
            "INSERT INTO post_slots (id, channel_id, target_time, last_posted_date, created_at) VALUES (?, ?, ?, '', ?)",
            (new_id, body.channel_id, body.target_time.strip(), _now()),
        )
        row = connection.execute(
            """
            SELECT s.*, c.name AS channel_name
            FROM post_slots s LEFT JOIN channels c ON c.id = s.channel_id
            WHERE s.id = ?
            """,
            (new_id,),
        ).fetchone()
    return {**dict(row), "posted_today": False}


@router.put("/{slot_id}")
def update_slot(slot_id: str, body: SlotUpdate):
    with db.connect() as connection:
        exists = connection.execute("SELECT 1 FROM post_slots WHERE id = ?", (slot_id,)).fetchone()
        if not exists:
            raise HTTPException(404, "Horário não encontrado.")
        connection.execute(
            "UPDATE post_slots SET target_time = ? WHERE id = ?",
            (body.target_time.strip(), slot_id),
        )
        row = connection.execute("SELECT * FROM post_slots WHERE id = ?", (slot_id,)).fetchone()
    return {**dict(row), "posted_today": (row["last_posted_date"] == _today())}


@router.post("/{slot_id}/posted")
def mark_posted(slot_id: str, body: PostedBody):
    value = _today() if body.posted else ""
    with db.connect() as connection:
        exists = connection.execute("SELECT 1 FROM post_slots WHERE id = ?", (slot_id,)).fetchone()
        if not exists:
            raise HTTPException(404, "Horário não encontrado.")
        connection.execute(
            "UPDATE post_slots SET last_posted_date = ? WHERE id = ?", (value, slot_id)
        )
    return {"slot_id": slot_id, "posted_today": body.posted}


@router.delete("/{slot_id}")
def delete_slot(slot_id: str):
    with db.connect() as connection:
        connection.execute("DELETE FROM post_slots WHERE id = ?", (slot_id,))
    return {"deleted": slot_id}
