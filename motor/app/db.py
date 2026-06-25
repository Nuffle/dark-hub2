"""Camada de dados local (SQLite). Cache rápido e trabalho offline;
a nuvem (Cloudflare) entra como fonte sincronizável numa fase posterior.
"""
from __future__ import annotations

import sqlite3
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)
DATABASE = DATA_DIR / "dark_hub.db"


def connect() -> sqlite3.Connection:
    connection = sqlite3.connect(DATABASE)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA journal_mode=WAL")
    return connection


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
                last_posted_date TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL
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
