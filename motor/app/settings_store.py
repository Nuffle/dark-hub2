"""Leitura/escrita de configurações simples (chave da API etc.) no SQLite."""
from __future__ import annotations

from . import db


def get(key: str, default: str = "") -> str:
    with db.connect() as connection:
        row = connection.execute(
            "SELECT value FROM settings WHERE key = ?", (key,)
        ).fetchone()
    return row["value"] if row else default


def set(key: str, value: str) -> None:
    with db.connect() as connection:
        connection.execute(
            """
            INSERT INTO settings (key, value) VALUES (?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
            """,
            (key, value),
        )


def get_youtube_api_key() -> str:
    return get("youtube_api_key", "")
