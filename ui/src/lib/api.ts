// Cliente do motor Python (FastAPI). Em dev, o Vite faz proxy de /api
// para http://127.0.0.1:8077 (ver vite.config.ts).

export type Health = {
  status: string;
  service: string;
  version: string;
};

// Em dev, o Vite faz proxy de /api para o motor. No app empacotado não há
// proxy, então falamos direto com o motor local.
export const API_BASE = import.meta.env.PROD ? "http://127.0.0.1:8077/api" : "/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!(init?.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
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

export type BackupSummary = {
  counts: Record<string, number>;
  last_local_backup: string | null;
  schema: number;
};

export type BackupSnapshot = {
  app: string;
  schema: number;
  exported_at: string;
  tables: Record<string, unknown[]>;
};

export type ImportResult = {
  restored: Record<string, number>;
  safety_backup: string;
  imported_at: string;
};

export type Channel = {
  id: string;
  name: string;
  channel_id: string;
  url: string;
  yt_schedule_url: string;
  first_video_date: string;
  niche: string;
  created_at: string;
  studio_url: string;
  age_days: number | null;
};

export type ChannelInput = {
  name: string;
  channel_id?: string;
  url?: string;
  yt_schedule_url?: string;
  first_video_date?: string;
  niche?: string;
};

export type Note = {
  id: string;
  title: string;
  body: string;
  created_at: string;
  updated_at: string;
};

export type PostSlot = {
  id: string;
  channel_id: string;
  channel_name: string | null;
  target_time: string;
  source: "manual" | "auto";
  sequence_index: number;
  last_posted_date: string;
  created_at: string;
  posted_today: boolean;
};

export type PostSettings = {
  channel_id: string;
  first_time: string;
  interval_hours: number;
  use_yt_schedule: boolean;
  yt_schedule_url: string;
  updated_at: string;
};

export type PostSettingsInput = {
  first_time: string;
  interval_hours: number;
  use_yt_schedule: boolean;
  yt_schedule_url: string;
};

export type PostSettingsResult = {
  settings: PostSettings;
  slots: PostSlot[];
};

export type Sound = {
  id: string;
  name: string;
  category: string;
  tags: string;
  favorite: number;
  filename: string;
  ext: string;
  size_bytes: number;
  duration_seconds: number;
  created_at: string;
};

export type SoundInput = {
  name: string;
  category?: string;
  tags?: string;
  favorite?: boolean | number;
};

export type SoundUpload = {
  file: File;
  name: string;
  category?: string;
  tags?: string;
};

export type CloudUsage = {
  used_bytes: number;
  limit_bytes: number;
  remaining_bytes: number;
  percentage: number;
  total_files: number;
  max_files: number;
  max_file_size_bytes: number;
  uploads_blocked: boolean;
  operations: {
    class_a: number;
    class_a_limit: number;
    class_b: number;
    class_b_limit: number;
  };
};

export type CloudStatus = {
  configured: boolean;
  connected: boolean;
  url?: string;
  revision?: number;
  remote_updated_at?: string;
  remote_size_bytes?: number;
  usage?: CloudUsage;
  error?: string;
};

export const api = {
  health: () => request<Health>("/health"),
  cloud: {
    config: () => request<{ configured: boolean; url: string }>("/cloud/config"),
    setConfig: (url: string, token: string) =>
      request<CloudStatus>("/cloud/config", {
        method: "PUT",
        body: JSON.stringify({ url, token }),
      }),
    status: () => request<CloudStatus>("/cloud/status"),
    push: () => request<{ revision: number; size_bytes: number }>("/cloud/push", { method: "POST" }),
    pull: () => request<ImportResult>("/cloud/pull", { method: "POST" }),
  },
  channels: {
    list: () => request<Channel[]>("/channels"),
    create: (data: ChannelInput) =>
      request<Channel>("/channels", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: ChannelInput) =>
      request<Channel>(`/channels/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    remove: (id: string) =>
      request<{ deleted: string }>(`/channels/${id}`, { method: "DELETE" }),
  },
  notes: {
    list: () => request<Note[]>("/notes"),
    create: (data: { title: string; body: string }) =>
      request<Note>("/notes", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: { title: string; body: string }) =>
      request<Note>(`/notes/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    remove: (id: string) =>
      request<{ deleted: string }>(`/notes/${id}`, { method: "DELETE" }),
  },
  posts: {
    list: () => request<PostSlot[]>("/posts"),
    settings: () => request<PostSettings[]>("/posts/settings"),
    updateSettings: (channelId: string, data: PostSettingsInput) =>
      request<PostSettingsResult>(`/posts/settings/${channelId}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    create: (channel_id: string, target_time: string) =>
      request<PostSlot>("/posts", {
        method: "POST",
        body: JSON.stringify({ channel_id, target_time }),
      }),
    update: (id: string, target_time: string) =>
      request<PostSlot>(`/posts/${id}`, {
        method: "PUT",
        body: JSON.stringify({ target_time }),
      }),
    setPosted: (id: string, posted: boolean) =>
      request<{ slot_id: string; posted_today: boolean }>(`/posts/${id}/posted`, {
        method: "POST",
        body: JSON.stringify({ posted }),
      }),
    remove: (id: string) =>
      request<{ deleted: string }>(`/posts/${id}`, { method: "DELETE" }),
  },
  sounds: {
    list: () => request<Sound[]>("/sounds"),
    upload: (data: SoundUpload) => {
      const form = new FormData();
      form.append("file", data.file);
      form.append("name", data.name);
      form.append("category", data.category ?? "");
      form.append("tags", data.tags ?? "");
      return request<Sound>("/sounds/upload", { method: "POST", body: form });
    },
    update: (id: string, data: SoundInput) =>
      request<Sound>(`/sounds/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    remove: (id: string) =>
      request<{ deleted: string }>(`/sounds/${id}`, { method: "DELETE" }),
    streamUrl: (id: string) => `${API_BASE}/sounds/${id}/stream`,
    downloadUrl: (id: string) => `${API_BASE}/sounds/${id}/download`,
  },
  backup: {
    summary: () => request<BackupSummary>("/backup/summary"),
    export: () => request<BackupSnapshot>("/backup/export"),
    import: (snapshot: BackupSnapshot) =>
      request<ImportResult>("/backup/import", {
        method: "POST",
        body: JSON.stringify({ snapshot }),
      }),
  },
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
