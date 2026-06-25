"""Motor de backup/restauração — snapshot de todos os dados locais num arquivo
portátil. É a perna 1 da portabilidade ("formatei e trouxe tudo de volta");
a perna 2 (sincronização automática no Cloudflare) será plugada por cima disto.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from . import db

SCHEMA_VERSION = 1

# Tabelas incluídas no snapshot. Ao adicionar módulos (canais, sons, anotações),
# basta listar as novas tabelas aqui.
EXPORT_TABLES = [
    "settings",
    "channels",
    "notes",
    "radar_outliers",
    "radar_runs",
    "video_snapshots",
    "quota_log",
]

BACKUP_DIR = db.DATA_DIR / "backups"


def _now() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def summary() -> dict[str, Any]:
    """Contagem do que está guardado, para mostrar antes de exportar."""
    counts: dict[str, int] = {}
    with db.connect() as connection:
        for table in EXPORT_TABLES:
            row = connection.execute(f"SELECT COUNT(*) AS n FROM {table}").fetchone()
            counts[table] = int(row["n"]) if row else 0
    last = None
    if BACKUP_DIR.exists():
        files = sorted(BACKUP_DIR.glob("*.json"), reverse=True)
        if files:
            last = files[0].name
    return {"counts": counts, "last_local_backup": last, "schema": SCHEMA_VERSION}


def export_snapshot() -> dict[str, Any]:
    tables: dict[str, list[dict[str, Any]]] = {}
    with db.connect() as connection:
        for table in EXPORT_TABLES:
            rows = connection.execute(f"SELECT * FROM {table}").fetchall()
            tables[table] = [dict(row) for row in rows]
    return {
        "app": "dark-hub",
        "schema": SCHEMA_VERSION,
        "exported_at": _now(),
        "tables": tables,
    }


def _write_safety_backup() -> str:
    """Antes de restaurar, grava o estado atual em data/backups/."""
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    path = BACKUP_DIR / f"pre-restore-{stamp}.json"
    path.write_text(
        json.dumps(export_snapshot(), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return path.name


def import_snapshot(snapshot: dict[str, Any]) -> dict[str, Any]:
    if snapshot.get("app") != "dark-hub":
        raise ValueError("Arquivo não é um backup do Dark Hub.")
    if int(snapshot.get("schema", 0)) > SCHEMA_VERSION:
        raise ValueError("Backup de uma versão mais nova do Dark Hub.")
    tables = snapshot.get("tables")
    if not isinstance(tables, dict):
        raise ValueError("Backup sem dados ('tables').")

    safety = _write_safety_backup()
    restored: dict[str, int] = {}
    with db.connect() as connection:
        connection.execute("PRAGMA foreign_keys=OFF")
        for table in EXPORT_TABLES:
            rows = tables.get(table)
            if not isinstance(rows, list):
                continue
            connection.execute(f"DELETE FROM {table}")
            count = 0
            for row in rows:
                if not isinstance(row, dict) or not row:
                    continue
                columns = list(row.keys())
                placeholders = ",".join("?" for _ in columns)
                column_list = ",".join(columns)
                connection.execute(
                    f"INSERT INTO {table} ({column_list}) VALUES ({placeholders})",
                    [row[col] for col in columns],
                )
                count += 1
            restored[table] = count
        connection.commit()
    return {"restored": restored, "safety_backup": safety, "imported_at": _now()}
