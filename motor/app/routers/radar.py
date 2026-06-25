"""Radar — busca de shorts virais fora da curva (YouTube Data API)."""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from .. import db, radar_score, settings_store, youtube

router = APIRouter()


class ConfigBody(BaseModel):
    youtube_api_key: str = ""


class SearchBody(BaseModel):
    query: str
    period_days: int = Field(default=14, ge=1, le=365)
    video_format: str = "short"  # short | long | all
    country: str = ""
    min_views: int = Field(default=10_000, ge=0)
    hunt_mode: str = "early"  # early | balanced | safe
    depth: str = "normal"  # quick | normal | deep
    max_results: int = Field(default=40, ge=6, le=60)


@router.get("/config")
def get_config():
    key = settings_store.get_youtube_api_key()
    return {
        "youtube_api_configured": bool(key),
        "quota_used": youtube.units_used_today(),
        "quota_total": youtube.DAILY_QUOTA,
        "quota_remaining": youtube.units_remaining(),
    }


@router.put("/config")
def put_config(body: ConfigBody):
    settings_store.set("youtube_api_key", body.youtube_api_key.strip())
    return get_config()


@router.post("/search")
async def search(body: SearchBody):
    query = body.query.strip()
    if len(query) < 2:
        raise HTTPException(400, "Digite um tema com pelo menos 2 caracteres.")
    if body.video_format not in {"short", "long", "all"}:
        raise HTTPException(400, "Formato inválido.")
    if body.hunt_mode not in {"early", "balanced", "safe"}:
        raise HTTPException(400, "Modo de garimpo inválido.")

    api_key = settings_store.get_youtube_api_key()
    if not api_key:
        raise HTTPException(400, "Configure a chave da YouTube Data API primeiro.")

    try:
        hunted = await youtube.hunt(
            query=query,
            period_days=body.period_days,
            video_format=body.video_format,
            country=body.country,
            min_views=body.min_views,
            api_key=api_key,
            depth=body.depth,
        )
    except youtube.QuotaExceeded as error:
        raise HTTPException(429, str(error)) from error
    except httpx.HTTPStatusError as error:
        raise HTTPException(502, f"YouTube API: {error}") from error
    except httpx.HTTPError as error:
        raise HTTPException(502, f"Falha de rede ao consultar a YouTube API: {error}") from error

    result = radar_score.analyze(query, hunted["raw"], body.hunt_mode, body.period_days)
    result["videos"] = result["videos"][: body.max_results]
    result["units_spent"] = hunted["units_spent"]
    result["quota_remaining"] = youtube.units_remaining()

    run_id = str(uuid.uuid4())
    with db.connect() as connection:
        connection.execute(
            """
            INSERT INTO radar_runs (id, query, provider, filters, summary, results, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                run_id,
                query,
                result["provider"],
                json.dumps(body.model_dump(exclude={"query"}), ensure_ascii=False),
                json.dumps(result["summary"], ensure_ascii=False),
                json.dumps(result, ensure_ascii=False),
                datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds"),
            ),
        )
    result["run_id"] = run_id
    return result


class RankingBody(BaseModel):
    period_days: int = Field(default=30, ge=1, le=365)
    min_views: int = Field(default=100_000, ge=0)
    hunt_mode: str = "early"
    country: str = ""
    max_results: int = Field(default=48, ge=6, le=60)


@router.post("/ranking")
async def ranking(body: RankingBody):
    if body.hunt_mode not in {"early", "balanced", "safe"}:
        raise HTTPException(400, "Modo de garimpo inválido.")
    api_key = settings_store.get_youtube_api_key()
    if not api_key:
        raise HTTPException(400, "Configure a chave da YouTube Data API primeiro.")

    try:
        hunted = await youtube.hunt(
            query="",
            period_days=body.period_days,
            video_format="short",
            country=body.country,
            min_views=body.min_views,
            api_key=api_key,
            depth="deep",
            ranking=True,
        )
    except youtube.QuotaExceeded as error:
        raise HTTPException(429, str(error)) from error
    except httpx.HTTPStatusError as error:
        raise HTTPException(502, f"YouTube API: {error}") from error
    except httpx.HTTPError as error:
        raise HTTPException(502, f"Falha de rede ao consultar a YouTube API: {error}") from error

    result = radar_score.analyze("Ranking geral", hunted["raw"], body.hunt_mode, body.period_days)
    result["videos"] = result["videos"][: body.max_results]
    result["units_spent"] = hunted["units_spent"]
    result["quota_remaining"] = youtube.units_remaining()
    result["ranking_mode"] = True

    run_id = str(uuid.uuid4())
    with db.connect() as connection:
        connection.execute(
            """
            INSERT INTO radar_runs (id, query, provider, filters, summary, results, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                run_id,
                "Ranking geral",
                result["provider"],
                json.dumps(body.model_dump(), ensure_ascii=False),
                json.dumps(result["summary"], ensure_ascii=False),
                json.dumps(result, ensure_ascii=False),
                datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds"),
            ),
        )
    result["run_id"] = run_id
    return result


@router.get("/history")
def history():
    with db.connect() as connection:
        rows = connection.execute(
            "SELECT id, query, provider, filters, summary, created_at FROM radar_runs ORDER BY created_at DESC LIMIT 30"
        ).fetchall()
    return [
        {
            **dict(row),
            "filters": json.loads(row["filters"]),
            "summary": json.loads(row["summary"]),
        }
        for row in rows
    ]


@router.get("/history/{run_id}")
def history_item(run_id: str):
    with db.connect() as connection:
        row = connection.execute(
            "SELECT results FROM radar_runs WHERE id = ?", (run_id,)
        ).fetchone()
    if not row:
        raise HTTPException(404, "Busca não encontrada.")
    return json.loads(row["results"])


class SaveBody(BaseModel):
    video_id: str
    channel_id: str = ""
    title: str = ""
    thumbnail: str = ""
    views: int = 0
    multiplier: float = 0
    opportunity_score: int = 0


@router.get("/saved")
def saved():
    with db.connect() as connection:
        rows = connection.execute(
            "SELECT * FROM radar_outliers ORDER BY saved_at DESC"
        ).fetchall()
    return [dict(row) for row in rows]


@router.post("/saved")
def save_video(body: SaveBody):
    with db.connect() as connection:
        connection.execute(
            """
            INSERT INTO radar_outliers
            (video_id, channel_id, title, thumbnail, views, multiplier, opportunity_score, saved_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(video_id) DO UPDATE SET
                views = excluded.views,
                multiplier = excluded.multiplier,
                opportunity_score = excluded.opportunity_score,
                saved_at = excluded.saved_at
            """,
            (
                body.video_id,
                body.channel_id,
                body.title,
                body.thumbnail,
                body.views,
                body.multiplier,
                body.opportunity_score,
                datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds"),
            ),
        )
    return {"saved": True, "video_id": body.video_id}


@router.delete("/saved/{video_id}")
def unsave_video(video_id: str):
    with db.connect() as connection:
        connection.execute(
            "DELETE FROM radar_outliers WHERE video_id = ?", (video_id,)
        )
    return {"saved": False, "video_id": video_id}
