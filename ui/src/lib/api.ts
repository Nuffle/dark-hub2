// Cliente do motor Python (FastAPI). Em dev, o Vite faz proxy de /api
// para http://127.0.0.1:8077 (ver vite.config.ts).

export type Health = {
  status: string;
  service: string;
  version: string;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(detail || `Erro ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export type RadarConfig = {
  youtube_api_configured: boolean;
  quota_used: number;
  quota_total: number;
  quota_remaining: number;
};

export type RadarVideo = {
  video_id: string;
  title: string;
  channel_id: string;
  channel_title: string;
  published_at: string;
  views: number;
  likes: number;
  comments: number;
  duration: number;
  subscribers: number;
  channel_avg_views: number;
  thumbnail: string;
  url: string;
  channel_url: string;
  age_hours: number;
  vph: number;
  effective_vph: number;
  outlier_multiplier: number;
  view_sub_ratio: number;
  engagement_rate: number;
  viral_score: number;
  outlier_score: number;
  remix_score: number;
  opportunity_score: number;
  freshness_score: number;
  growth_pct: number;
  signal: "exploding" | "rising" | "watch";
};

export type RadarChannel = {
  channel_id: string;
  title: string;
  subscribers: number;
  url: string;
  outlier_count: number;
  best_multiplier: number;
  top_opportunity: number;
  average_views: number;
};

export type RadarKeyword = {
  term: string;
  count: number;
  weight: number;
};

export type RadarResult = {
  query: string;
  provider: string;
  generated_at: string;
  units_spent: number;
  quota_remaining: number;
  run_id: string;
  summary: {
    sample_videos: number;
    median_views: number;
    average_vph: number;
    top_opportunity: number;
    top_multiplier: number;
    tracked_videos: number;
  };
  videos: RadarVideo[];
  channels: RadarChannel[];
  keywords: RadarKeyword[];
  methodology: Record<string, string>;
};

export type RadarSearchParams = {
  query: string;
  period_days: number;
  video_format: "short" | "long" | "all";
  min_views: number;
  hunt_mode: "early" | "balanced" | "safe";
  depth: "quick" | "normal" | "deep";
  max_results: number;
};

export type SavedOutlier = {
  video_id: string;
  channel_id: string;
  title: string;
  thumbnail: string;
  views: number;
  multiplier: number;
  opportunity_score: number;
  saved_at: string;
};

export type RadarHistoryEntry = {
  id: string;
  query: string;
  provider: string;
  filters: Record<string, unknown>;
  summary: RadarResult["summary"];
  created_at: string;
};

export const api = {
  health: () => request<Health>("/health"),
  radar: {
    config: () => request<RadarConfig>("/radar/config"),
    setKey: (youtube_api_key: string) =>
      request<RadarConfig>("/radar/config", {
        method: "PUT",
        body: JSON.stringify({ youtube_api_key }),
      }),
    search: (params: RadarSearchParams) =>
      request<RadarResult>("/radar/search", {
        method: "POST",
        body: JSON.stringify(params),
      }),
    ranking: (params: {
      period_days: number;
      min_views: number;
      hunt_mode: RadarSearchParams["hunt_mode"];
      max_results: number;
    }) =>
      request<RadarResult>("/radar/ranking", {
        method: "POST",
        body: JSON.stringify(params),
      }),
    history: () => request<RadarHistoryEntry[]>("/radar/history"),
    historyItem: (id: string) => request<RadarResult>(`/radar/history/${id}`),
    saved: () => request<SavedOutlier[]>("/radar/saved"),
    save: (video: SavedOutlier | Omit<SavedOutlier, "saved_at">) =>
      request<{ saved: boolean; video_id: string }>("/radar/saved", {
        method: "POST",
        body: JSON.stringify(video),
      }),
    unsave: (videoId: string) =>
      request<{ saved: boolean; video_id: string }>(`/radar/saved/${videoId}`, {
        method: "DELETE",
      }),
  },
};

