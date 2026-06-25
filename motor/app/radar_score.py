"""Scoring do Radar. O destaque é o `outlier_multiplier`: quantas vezes o
vídeo rendeu acima do desempenho típico do canal. É o sinal de "fora da
curva" — funciona já na primeira busca, pois usamos as estatísticas do canal.
"""
from __future__ import annotations

import math
import re
import statistics
from datetime import datetime, timezone

from . import db


def _clamp(value: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, value))


def _percentiles(values: list[float]) -> list[float]:
    if not values:
        return []
    if len(values) == 1:
        return [100.0]
    order = sorted(values)
    n = len(order) - 1
    out = []
    for value in values:
        lower = next(i for i, v in enumerate(order) if v == value)
        upper = len(order) - 1 - next(i for i, v in enumerate(reversed(order)) if v == value)
        out.append((lower + upper) / 2 / n * 100)
    return out


def _outlier_multiplier(video: dict) -> float:
    """views do vídeo ÷ baseline do canal. Baseline = média de views por vídeo
    do canal; se indisponível, cai para inscritos. Sem baseline, retorna 0."""
    views = float(video.get("views") or 0)
    baseline = float(video.get("channel_avg_views") or 0)
    if baseline <= 0:
        subs = float(video.get("subscribers") or 0)
        baseline = subs if subs > 0 else 0
    if baseline <= 0:
        return 0.0
    return round(views / baseline, 1)


def _remixability(video: dict) -> int:
    text = " ".join(
        [
            str(video.get("title") or ""),
            str(video.get("description") or ""),
            " ".join(str(t) for t in video.get("tags") or []),
        ]
    ).lower()
    score = 44.0
    if re.search(
        r"(curios|fatos?|facts?|sabia|did you know|mist[eé]rio|hist[oó]ria|animai|ci[eê]ncia|top\s*\d+|\d+\s+coisas|por que|why|como|how)",
        text,
    ):
        score += 22
    if re.search(r"(explicad|document[aá]rio|sem rosto|faceless|story|hist[oó]ria real)", text):
        score += 10
    if re.search(r"(\?|\d+)", str(video.get("title") or "")):
        score += 7
    if int(video.get("duration") or 0) <= 75:
        score += 8
    elif int(video.get("duration") or 0) <= 180:
        score += 4
    if re.search(r"(music|clipe|trailer|live|gameplay|highlights|react|podcast completo)", text):
        score -= 18
    return round(_clamp(score))


def _small_channel(video: dict) -> int:
    subs = int(video.get("subscribers") or 0)
    vsr = float(video.get("view_sub_ratio") or 0)
    if subs <= 0:
        size = 18
    elif subs <= 10_000:
        size = 34
    elif subs <= 50_000:
        size = 29
    elif subs <= 100_000:
        size = 23
    elif subs <= 500_000:
        size = 13
    elif subs <= 1_000_000:
        size = 6
    else:
        size = 0
    ratio = min(34, math.log10(vsr + 1) * 34)
    return round(_clamp(size + ratio + 14))


def _apply_snapshots(videos: list[dict], now: datetime) -> None:
    ids = [v["video_id"] for v in videos if v.get("video_id")]
    if not ids:
        return
    now_text = now.isoformat(timespec="seconds")
    with db.connect() as connection:
        placeholders = ",".join("?" for _ in ids)
        rows = connection.execute(
            f"SELECT video_id, first_seen_at, last_seen_at, views FROM video_snapshots WHERE video_id IN ({placeholders})",
            ids,
        ).fetchall()
        previous = {row["video_id"]: dict(row) for row in rows}
        for video in videos:
            vid = video["video_id"]
            views = int(video.get("views") or 0)
            old = previous.get(vid)
            if old:
                old_seen = old.get("last_seen_at") or ""
                try:
                    seen_dt = datetime.fromisoformat(str(old_seen).replace("Z", "+00:00"))
                    hours = max(0.0, (now - seen_dt).total_seconds() / 3600)
                    delta = max(0, views - int(old.get("views") or 0))
                    if hours >= 0.16:
                        video["real_vph"] = round(delta / hours, 1)
                        video["growth_pct"] = round(delta / max(1, int(old.get("views") or 1)) * 100, 2)
                except ValueError:
                    pass
            connection.execute(
                """
                INSERT INTO video_snapshots (video_id, first_seen_at, last_seen_at, views, sample_count)
                VALUES (?, ?, ?, ?, 1)
                ON CONFLICT(video_id) DO UPDATE SET
                    last_seen_at = excluded.last_seen_at,
                    views = excluded.views,
                    sample_count = video_snapshots.sample_count + 1
                """,
                (vid, str(old["first_seen_at"]) if old else now_text, now_text, views),
            )


def analyze(query: str, raw: list[dict], hunt_mode: str, period_days: int) -> dict:
    now = datetime.now(timezone.utc)
    videos: list[dict] = []
    for item in raw:
        published_at = item.get("published_at", "")
        age_hours = 0.0
        if published_at:
            try:
                published = datetime.fromisoformat(published_at.replace("Z", "+00:00"))
                age_hours = max(1.0, (now - published).total_seconds() / 3600)
            except ValueError:
                age_hours = 0.0
        views = int(item.get("views") or 0)
        subs = int(item.get("subscribers") or 0)
        likes = int(item.get("likes") or 0)
        comments = int(item.get("comments") or 0)
        vph = views / age_hours if age_hours else 0.0
        vsr = views / subs if subs else 0.0
        engagement = (likes + comments) / views * 100 if views else 0.0
        videos.append(
            {
                **item,
                "age_hours": round(age_hours, 1),
                "vph": round(vph, 1),
                "view_sub_ratio": round(vsr, 2),
                "engagement_rate": round(engagement, 2),
                "outlier_multiplier": _outlier_multiplier(item),
                "url": (
                    f"https://www.youtube.com/shorts/{item['video_id']}"
                    if item.get("duration", 0) <= 180
                    else f"https://www.youtube.com/watch?v={item['video_id']}"
                ),
                "channel_url": f"https://www.youtube.com/channel/{item['channel_id']}",
            }
        )

    _apply_snapshots(videos, now)
    for video in videos:
        real_vph = float(video.get("real_vph") or 0)
        video["growth_pct"] = float(video.get("growth_pct") or 0)
        video["effective_vph"] = round(max(float(video.get("vph") or 0), real_vph * 1.15), 1)

    view_pct = _percentiles([math.log1p(v["views"]) for v in videos])
    vph_pct = _percentiles([math.log1p(v["effective_vph"]) for v in videos])
    mult_pct = _percentiles([math.log1p(v["outlier_multiplier"]) for v in videos])

    for i, video in enumerate(videos):
        freshness = (
            max(0.0, 100.0 - video["age_hours"] / max(24, period_days * 24) * 100.0)
            if video["age_hours"]
            else 0.0
        )
        video["freshness_score"] = round(freshness)
        # Viralidade: alcance + velocidade + recência.
        viral = view_pct[i] * 0.40 + vph_pct[i] * 0.35 + freshness * 0.25
        if video["growth_pct"] > 0:
            viral += min(8.0, video["growth_pct"] / 18.0)
        video["viral_score"] = round(min(100, viral))

        remix = _remixability(video)
        small = _small_channel(video)
        outlier = mult_pct[i]
        video["remix_score"] = remix
        video["small_boom_score"] = small
        video["outlier_score"] = round(outlier)

        # Oportunidade: o outlier pesa mais conforme o modo de garimpo.
        if hunt_mode == "safe":
            opp = viral * 0.50 + outlier * 0.20 + remix * 0.18 + small * 0.12
        elif hunt_mode == "early":
            opp = viral * 0.28 + outlier * 0.34 + remix * 0.18 + small * 0.20
        else:  # balanced
            opp = viral * 0.38 + outlier * 0.27 + remix * 0.18 + small * 0.17
        video["opportunity_score"] = round(_clamp(opp))
        video["signal"] = (
            "exploding"
            if video["opportunity_score"] >= 82
            else "rising"
            if video["opportunity_score"] >= 65
            else "watch"
        )

    videos.sort(
        key=lambda v: (v["opportunity_score"], v["outlier_multiplier"], v["effective_vph"], v["views"]),
        reverse=True,
    )

    median_views = round(statistics.median([v["views"] for v in videos])) if videos else 0
    top_multiplier = max((v["outlier_multiplier"] for v in videos), default=0.0)
    avg_vph = round(statistics.mean(v["vph"] for v in videos), 1) if videos else 0
    tracked = sum(1 for v in videos if v.get("real_vph") is not None)

    return {
        "query": query,
        "provider": "youtube_data_api",
        "generated_at": now.astimezone().isoformat(timespec="seconds"),
        "summary": {
            "sample_videos": len(videos),
            "median_views": median_views,
            "average_vph": avg_vph,
            "top_opportunity": videos[0]["opportunity_score"] if videos else 0,
            "top_multiplier": top_multiplier,
            "tracked_videos": tracked,
        },
        "videos": videos,
        "methodology": {
            "outlier_multiplier": "Views do vídeo dividido pela média de views por vídeo do canal (ou inscritos). Acima de ~5x já é fora da curva.",
            "viral_score": "40% alcance, 35% velocidade (VPH), 25% recência.",
            "opportunity_score": "Mistura viralidade, outlier, replicabilidade e tamanho do canal conforme o modo de garimpo.",
        },
    }
