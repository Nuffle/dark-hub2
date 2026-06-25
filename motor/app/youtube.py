"""Cliente da YouTube Data API com contabilidade de quota.

Custos (unidades): search.list = 100, videos.list = 1, channels.list = 1.
Cota diária padrão = 10.000 unidades. A estratégia do Radar é gastar pouco
em buscas (caras) e muito em enriquecimento (barato) para detectar outliers.
"""
from __future__ import annotations

import re
from datetime import datetime, timezone

import httpx

from . import db

SEARCH_COST = 100
CHEAP_COST = 1
DAILY_QUOTA = 10_000

API = "https://www.googleapis.com/youtube/v3"


class QuotaExceeded(Exception):
    """Quota diária insuficiente para a operação pedida."""


def _today() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def units_used_today() -> int:
    with db.connect() as connection:
        row = connection.execute(
            "SELECT units FROM quota_log WHERE day = ?", (_today(),)
        ).fetchone()
    return int(row["units"]) if row else 0


def units_remaining() -> int:
    return max(0, DAILY_QUOTA - units_used_today())


def _record(units: int) -> None:
    with db.connect() as connection:
        connection.execute(
            """
            INSERT INTO quota_log (day, units) VALUES (?, ?)
            ON CONFLICT(day) DO UPDATE SET units = units + excluded.units
            """,
            (_today(), units),
        )


def _chunks(items: list[str], size: int) -> list[list[str]]:
    return [items[i : i + size] for i in range(0, len(items), size)]


def iso_duration(value: str) -> int:
    match = re.fullmatch(
        r"P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", value or ""
    )
    if not match:
        return 0
    days, hours, minutes, seconds = (int(part or 0) for part in match.groups())
    return days * 86400 + hours * 3600 + minutes * 60 + seconds


def sanitize_error(text: str) -> str:
    text = re.sub(r"([?&]key=)[^&\s]+", r"\1***", text)
    return re.sub(r"(AIza)[A-Za-z0-9_-]+", r"\1***", text)


def _raise(response: httpx.Response) -> None:
    if response.is_success:
        return
    try:
        message = response.json()["error"]["message"]
    except Exception:
        message = response.text or f"Erro {response.status_code}"
    raise httpx.HTTPStatusError(
        sanitize_error(message), request=response.request, response=response
    )


def query_variations(query: str, limit: int) -> list[str]:
    base = re.sub(r"\s+", " ", query.replace("#", " ")).strip()
    if not base:
        return ["shorts"][:limit] or ["shorts"]
    low = base.lower()
    variants = [base]
    if not re.search(r"\bshorts?\b", low):
        variants.append(f"{base} shorts")
    if not re.search(r"curiosidad|fatos?|facts?|mist[eé]rio", low):
        variants.append(f"{base} curiosidades")
    seen: set[str] = set()
    unique: list[str] = []
    for item in variants:
        if item.lower() not in seen:
            seen.add(item.lower())
            unique.append(item)
    return unique[: max(1, limit)]


# Quantas chamadas search.list (caras) cada profundidade tenta usar.
DEPTH_SEARCH_CALLS = {"quick": 1, "normal": 2, "deep": 3}

# Consultas genéricas do "Ranking geral" — descobrir virais sem tema digitado.
RANKING_QUERIES = ["shorts viral", "#shorts", "curiosidades", "fatos incríveis"]


async def hunt(
    *,
    query: str,
    period_days: int,
    video_format: str,
    country: str,
    min_views: int,
    api_key: str,
    depth: str = "normal",
    ranking: bool = False,
) -> dict:
    """Busca candidatos via search.list (caro) e enriquece via videos/channels
    .list (barato). Devolve itens crus já com estatísticas do canal para o
    cálculo de outlier. Respeita a quota diária restante."""
    remaining = units_remaining()
    affordable = remaining // SEARCH_COST
    if affordable < 1:
        raise QuotaExceeded(
            f"Quota diária da YouTube API esgotada ({units_used_today()}/{DAILY_QUOTA}). "
            "Ela reseta à meia-noite no horário do Pacífico."
        )
    if ranking:
        planned = min(len(RANKING_QUERIES), max(2, affordable))
        queries = RANKING_QUERIES[:planned]
    else:
        planned = min(DEPTH_SEARCH_CALLS.get(depth, 2), affordable)
        queries = query_variations(query, planned)

    published_after = None
    if period_days:
        from datetime import timedelta

        published_after = (
            (datetime.now(timezone.utc) - timedelta(days=period_days))
            .isoformat(timespec="seconds")
            .replace("+00:00", "Z")
        )

    base_params: dict[str, object] = {
        "part": "snippet",
        "type": "video",
        "maxResults": 50,
        "order": "viewCount",
        "safeSearch": "moderate",
        "key": api_key,
    }
    if published_after:
        base_params["publishedAfter"] = published_after
    if country:
        base_params["regionCode"] = country.upper()
    if video_format == "short":
        base_params["videoDuration"] = "short"

    candidate_ids: list[str] = []
    spent = 0
    async with httpx.AsyncClient(timeout=60) as client:
        for search_query in queries:
            if units_remaining() < SEARCH_COST:
                break
            response = await client.get(
                f"{API}/search", params={**base_params, "q": search_query}
            )
            _raise(response)
            _record(SEARCH_COST)
            spent += SEARCH_COST
            for item in response.json().get("items", []):
                vid = item.get("id", {}).get("videoId")
                if vid and vid not in candidate_ids:
                    candidate_ids.append(vid)

        if not candidate_ids:
            return {"raw": [], "units_spent": spent}

        videos_data: list[dict] = []
        for chunk in _chunks(candidate_ids, 50):
            response = await client.get(
                f"{API}/videos",
                params={
                    "part": "snippet,statistics,contentDetails",
                    "id": ",".join(chunk),
                    "key": api_key,
                },
            )
            _raise(response)
            _record(CHEAP_COST)
            spent += CHEAP_COST
            videos_data.extend(response.json().get("items", []))

        channel_ids = sorted({v["snippet"]["channelId"] for v in videos_data})
        channels: dict[str, dict] = {}
        for chunk in _chunks(channel_ids, 50):
            response = await client.get(
                f"{API}/channels",
                params={
                    "part": "snippet,statistics",
                    "id": ",".join(chunk),
                    "key": api_key,
                },
            )
            _raise(response)
            _record(CHEAP_COST)
            spent += CHEAP_COST
            for item in response.json().get("items", []):
                channels[item["id"]] = item

    raw: list[dict] = []
    rank = 0
    for item in videos_data:
        snippet = item["snippet"]
        stats = item.get("statistics", {})
        if snippet.get("liveBroadcastContent") not in {None, "none"}:
            continue
        duration = iso_duration(item.get("contentDetails", {}).get("duration", ""))
        if video_format == "short" and (duration <= 0 or duration > 180):
            continue
        if video_format == "long" and duration <= 180:
            continue
        views = int(stats.get("viewCount", 0))
        if views < min_views:
            continue
        channel = channels.get(snippet["channelId"], {})
        cstats = channel.get("statistics", {})
        channel_views = int(cstats.get("viewCount", 0))
        channel_videos = int(cstats.get("videoCount", 0))
        channel_avg_views = channel_views / channel_videos if channel_videos else 0
        thumbs = snippet.get("thumbnails", {})
        thumbnail = (
            thumbs.get("maxres")
            or thumbs.get("high")
            or thumbs.get("medium")
            or thumbs.get("default")
            or {}
        ).get("url", "")
        raw.append(
            {
                "video_id": item["id"],
                "title": snippet.get("title", ""),
                "description": snippet.get("description", ""),
                "channel_id": snippet["channelId"],
                "channel_title": snippet.get("channelTitle", ""),
                "published_at": snippet.get("publishedAt", ""),
                "views": views,
                "likes": int(stats.get("likeCount", 0)),
                "comments": int(stats.get("commentCount", 0)),
                "duration": duration,
                "subscribers": int(cstats.get("subscriberCount", 0)),
                "channel_views": channel_views,
                "channel_videos": channel_videos,
                "channel_avg_views": round(channel_avg_views),
                "thumbnail": thumbnail,
                "tags": snippet.get("tags", []),
                "search_rank": rank,
            }
        )
        rank += 1

    return {"raw": raw, "units_spent": spent}
