"""Anotações — CRUD simples com autosave."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .. import db

router = APIRouter()


class NoteBody(BaseModel):
    title: str = ""
    body: str = ""


def _now() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


@router.get("")
def list_notes():
    with db.connect() as connection:
        rows = connection.execute(
            "SELECT * FROM notes ORDER BY updated_at DESC"
        ).fetchall()
    return [dict(row) for row in rows]


@router.post("")
def create_note(body: NoteBody):
    new_id = str(uuid.uuid4())
    now = _now()
    with db.connect() as connection:
        connection.execute(
            "INSERT INTO notes (id, title, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
            (new_id, body.title.strip(), body.body, now, now),
        )
        row = connection.execute("SELECT * FROM notes WHERE id = ?", (new_id,)).fetchone()
    return dict(row)


@router.put("/{note_id}")
def update_note(note_id: str, body: NoteBody):
    with db.connect() as connection:
        exists = connection.execute("SELECT 1 FROM notes WHERE id = ?", (note_id,)).fetchone()
        if not exists:
            raise HTTPException(404, "Anotação não encontrada.")
        connection.execute(
            "UPDATE notes SET title = ?, body = ?, updated_at = ? WHERE id = ?",
            (body.title.strip(), body.body, _now(), note_id),
        )
        row = connection.execute("SELECT * FROM notes WHERE id = ?", (note_id,)).fetchone()
    return dict(row)


@router.delete("/{note_id}")
def delete_note(note_id: str):
    with db.connect() as connection:
        connection.execute("DELETE FROM notes WHERE id = ?", (note_id,))
    return {"deleted": note_id}
