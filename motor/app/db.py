"""Camada de dados local (SQLite). Cache rápido e trabalho offline;
a nuvem (Cloudflare) entra como fonte sincronizável numa fase posterior.
"""
from __future__ import annotations

import os
import sqlite3
from pathlib import Path


def _data_root() -> Path:
    # Em produção (app empacotado), o Tauri passa DARK_HUB_DATA apontando para
    # uma pasta gravável do usuário (%APPDATA%). Em dev, usa motor/data.
    env = os.environ.get("DARK_HUB_DATA")
    if env:
        return Path(env)
    return Path(__file__).resolve().parent.parent / "data"


DATA_DIR = _data_root()
DATA_DIR.mkdir(parents=True, exist_ok=True)
DATABASE = DATA_DIR / "dark_hub.db"


def connect() -> sqlite3.Connection:
    connection = sqlite3.connect(DATABASE)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA journal_mode=WAL")
    return connection


def _ensure_column(
    connection: sqlite3.Connection,
    table: str,
    column: str,
    definition: str,
) -> None:
    columns = {
        row["name"]
        for row in connection.execute(f"PRAGMA table_info({table})").fetchall()
    }
    if column not in columns:
        connection.execute(f"ALTER TABLE {table} ADD COLUMN {definition}")


def initialize() -> None:
    with connect() as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            -- Contabilidade de quota da YouTube Data API por dia (UTC).
            CREATE TABLE IF NOT EXISTS quota_log (
                day TEXT PRIMARY KEY,
                units INTEGER NOT NULL DEFAULT 0
            );

            -- Snapshots de vídeos para calcular VPH real entre buscas.
            CREATE TABLE IF NOT EXISTS video_snapshots (
                video_id TEXT PRIMARY KEY,
                first_seen_at TEXT NOT NULL,
                last_seen_at TEXT NOT NULL,
                views INTEGER NOT NULL DEFAULT 0,
                sample_count INTEGER NOT NULL DEFAULT 0
            );

            -- Histórico de buscas do Radar.
            CREATE TABLE IF NOT EXISTS radar_runs (
                id TEXT PRIMARY KEY,
                query TEXT NOT NULL,
                provider TEXT NOT NULL,
                filters TEXT NOT NULL DEFAULT '{}',
                summary TEXT NOT NULL DEFAULT '{}',
                results TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_radar_runs_created
            ON radar_runs(created_at DESC);

            -- Acervo próprio de outliers fortes que cresce com o uso.
            CREATE TABLE IF NOT EXISTS radar_outliers (
                video_id TEXT PRIMARY KEY,
                channel_id TEXT,
                title TEXT,
                thumbnail TEXT,
                views INTEGER,
                multiplier REAL,
                opportunity_score INTEGER,
                saved_at TEXT NOT NULL
            );

            -- Canais do usuário (idade, link do Studio).
            CREATE TABLE IF NOT EXISTS channels (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                channel_id TEXT NOT NULL DEFAULT '',
                url TEXT NOT NULL DEFAULT '',
                yt_schedule_url TEXT NOT NULL DEFAULT '',
                first_video_date TEXT NOT NULL DEFAULT '',
                niche TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL
            );

            -- Anotações.
            CREATE TABLE IF NOT EXISTS notes (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL DEFAULT '',
                body TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            -- Controle de Posts: horários-alvo por canal + marca de "postei hoje".
            CREATE TABLE IF NOT EXISTS post_slots (
                id TEXT PRIMARY KEY,
                channel_id TEXT NOT NULL,
                target_time TEXT NOT NULL DEFAULT '',
                source TEXT NOT NULL DEFAULT 'manual',
                sequence_index INTEGER NOT NULL DEFAULT 0,
                last_posted_date TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS post_channel_settings (
                channel_id TEXT PRIMARY KEY,
                first_time TEXT NOT NULL DEFAULT '',
                interval_hours REAL NOT NULL DEFAULT 6,
                use_yt_schedule INTEGER NOT NULL DEFAULT 0,
                yt_schedule_url TEXT NOT NULL DEFAULT '',
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS sounds (
                id TEXT PRIMARY KEY,
                name TEXT,
                category TEXT DEFAULT '',
                tags TEXT DEFAULT '',
                favorite INTEGER DEFAULT 0,
                filename TEXT,
                ext TEXT,
                size_bytes INTEGER DEFAULT 0,
                duration_seconds REAL DEFAULT 0,
                created_at TEXT NOT NULL
            );
            """
        )
        _ensure_column(
            connection,
            "post_slots",
            "source",
            "source TEXT NOT NULL DEFAULT 'manual'",
        )
        _ensure_column(
            connection,
            "post_slots",
            "sequence_index",
            "sequence_index INTEGER NOT NULL DEFAULT 0",
        )
        _ensure_column(
            connection,
            "channels",
            "yt_schedule_url",
            "yt_schedule_url TEXT NOT NULL DEFAULT ''",
        )
        connection.execute(
            """
            UPDATE channels
            SET yt_schedule_url = (
                SELECT yt_schedule_url
                FROM post_channel_settings
                WHERE post_channel_settings.channel_id = channels.id
            )
            WHERE yt_schedule_url = ''
              AND EXISTS (
                SELECT 1
                FROM post_channel_settings
                WHERE post_channel_settings.channel_id = channels.id
                  AND post_channel_settings.yt_schedule_url != ''
              )
            """
        )
