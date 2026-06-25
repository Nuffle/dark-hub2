"""Controle de Posts — horários-alvo por canal e marcação de "postei hoje"."""
from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from .. import db

router = APIRouter()

TIME_RE = re.compile(r"^([01]\d|2[0-3]):([0-5]\d)$")
MAX_AUTO_SLOTS = 24


class SlotBody(BaseModel):
    channel_id: str
    target_time: str = ""  # "HH:MM"


class SlotUpdate(BaseModel):
    target_time: str = ""


class PostedBody(BaseModel):
    posted: bool


class PostSettingsBody(BaseModel):
    first_time: str = ""
    interval_hours: float = Field(default=6, ge=0.25, le=24)
    use_yt_schedule: bool = False
    yt_schedule_url: str = ""


def _now() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def _today() -> str:
    return datetime.now().astimezone().strftime("%Y-%m-%d")


def _validate_time(value: str) -> str:
    value = value.strip()
    if not value:
        return ""
    if not TIME_RE.match(value):
        raise HTTPException(400, "Use um horário no formato HH:MM.")
    return value


def _minutes_to_time(value: int) -> str:
    return f"{value // 60:02d}:{value % 60:02d}"


def _time_to_minutes(value: str) -> int:
    hour, minute = value.split(":")
    return int(hour) * 60 + int(minute)


def _generate_times(first_time: str, interval_hours: float) -> list[str]:
    first_time = _validate_time(first_time)
    if not first_time:
        return []
    interval_minutes = int(round(interval_hours * 60))
    if interval_minutes <= 0:
        raise HTTPException(400, "O intervalo precisa ser maior que zero.")

    times: list[str] = []
    current = _time_to_minutes(first_time)
    while current < 24 * 60 and len(times) < MAX_AUTO_SLOTS:
        times.append(_minutes_to_time(current))
        current += interval_minutes
    return times


def _slot_dict(row, today: str | None = None) -> dict:
    today = today or _today()
    return {**dict(row), "posted_today": (row["last_posted_date"] == today)}


def _settings_dict(row, channel_id: str) -> dict:
    if not row:
        return {
            "channel_id": channel_id,
            "first_time": "",
            "interval_hours": 6,
            "use_yt_schedule": False,
            "yt_schedule_url": "",
            "updated_at": "",
        }
    item = dict(row)
    item["use_yt_schedule"] = bool(item["use_yt_schedule"])
    return item


def _list_slots(connection) -> list[dict]:
    rows = connection.execute(
        """
        SELECT s.*, c.name AS channel_name
        FROM post_slots s
        LEFT JOIN channels c ON c.id = s.channel_id
        ORDER BY c.name, s.sequence_index, s.target_time
        """
    ).fetchall()
    today = _today()
    return [_slot_dict(row, today) for row in rows]


def _sync_auto_slots(connection, channel_id: str, times: list[str]) -> None:
    keep = set(times)
    if keep:
        placeholders = ",".join("?" for _ in keep)
        connection.execute(
            f"""
            DELETE FROM post_slots
            WHERE channel_id = ? AND source = 'auto' AND target_time NOT IN ({placeholders})
            """,
            [channel_id, *keep],
        )
    else:
        connection.execute(
            "DELETE FROM post_slots WHERE channel_id = ? AND source = 'auto'",
            (channel_id,),
        )

    for index, target_time in enumerate(times, start=1):
        existing = connection.execute(
            "SELECT id FROM post_slots WHERE channel_id = ? AND target_time = ?",
            (channel_id, target_time),
        ).fetchone()
        if existing:
            connection.execute(
                """
                UPDATE post_slots
                SET source = 'auto', sequence_index = ?
                WHERE id = ?
                """,
                (index, existing["id"]),
            )
        else:
            connection.execute(
                """
                INSERT INTO post_slots (
                    id, channel_id, target_time, source, sequence_index,
                    last_posted_date, created_at
                )
                VALUES (?, ?, ?, 'auto', ?, '', ?)
                """,
                (str(uuid.uuid4()), channel_id, target_time, index, _now()),
            )


@router.get("")
def list_slots():
    with db.connect() as connection:
        return _list_slots(connection)


@router.get("/settings")
def list_settings():
    with db.connect() as connection:
        channels = connection.execute("SELECT id FROM channels ORDER BY name").fetchall()
        rows = connection.execute("SELECT * FROM post_channel_settings").fetchall()
    by_channel = {row["channel_id"]: row for row in rows}
    return [_settings_dict(by_channel.get(channel["id"]), channel["id"]) for channel in channels]


@router.put("/settings/{channel_id}")
def update_settings(channel_id: str, body: PostSettingsBody):
    first_time = _validate_time(body.first_time)
    interval_hours = float(body.interval_hours)
    times = [] if body.use_yt_schedule else _generate_times(first_time, interval_hours)
    now = _now()

    with db.connect() as connection:
        channel = connection.execute(
            "SELECT 1 FROM channels WHERE id = ?", (channel_id,)
        ).fetchone()
        if not channel:
            raise HTTPException(404, "Canal não encontrado.")

        connection.execute(
            """
            INSERT INTO post_channel_settings (
                channel_id, first_time, interval_hours, use_yt_schedule,
                yt_schedule_url, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(channel_id) DO UPDATE SET
                first_time = excluded.first_time,
                interval_hours = excluded.interval_hours,
                use_yt_schedule = excluded.use_yt_schedule,
                yt_schedule_url = excluded.yt_schedule_url,
                updated_at = excluded.updated_at
            """,
            (
                channel_id,
                first_time,
                interval_hours,
                1 if body.use_yt_schedule else 0,
                body.yt_schedule_url.strip(),
                now,
            ),
        )
        if not body.use_yt_schedule:
            _sync_auto_slots(connection, channel_id, times)
        row = connection.execute(
            "SELECT * FROM post_channel_settings WHERE channel_id = ?", (channel_id,)
        ).fetchone()
        slots = _list_slots(connection)
    return {"settings": _settings_dict(row, channel_id), "slots": slots}


@router.post("")
def create_slot(body: SlotBody):
    target_time = _validate_time(body.target_time)
    new_id = str(uuid.uuid4())
    with db.connect() as connection:
        channel = connection.execute(
            "SELECT 1 FROM channels WHERE id = ?", (body.channel_id,)
        ).fetchone()
        if not channel:
            raise HTTPException(404, "Canal não encontrado.")
        connection.execute(
            """
            INSERT INTO post_slots (
                id, channel_id, target_time, source, sequence_index,
                last_posted_date, created_at
            )
            VALUES (?, ?, ?, 'manual', 999, '', ?)
            """,
            (new_id, body.channel_id, target_time, _now()),
        )
        row = connection.execute(
            """
            SELECT s.*, c.name AS channel_name
            FROM post_slots s LEFT JOIN channels c ON c.id = s.channel_id
            WHERE s.id = ?
            """,
            (new_id,),
        ).fetchone()
    return _slot_dict(row)


@router.put("/{slot_id}")
def update_slot(slot_id: str, body: SlotUpdate):
    target_time = _validate_time(body.target_time)
    with db.connect() as connection:
        exists = connection.execute("SELECT 1 FROM post_slots WHERE id = ?", (slot_id,)).fetchone()
        if not exists:
            raise HTTPException(404, "Horário não encontrado.")
        connection.execute(
            "UPDATE post_slots SET target_time = ?, source = 'manual' WHERE id = ?",
            (target_time, slot_id),
        )
        row = connection.execute("SELECT * FROM post_slots WHERE id = ?", (slot_id,)).fetchone()
    return _slot_dict(row)


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
