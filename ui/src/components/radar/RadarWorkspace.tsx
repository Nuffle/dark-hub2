import { useEffect, useMemo, useState } from "react";
import { Search, Loader2, Zap, Gauge, History, Bookmark, Trophy } from "lucide-react";
import {
  api,
  type RadarConfig,
  type RadarResult,
  type RadarSearchParams,
  type RadarVideo,
  type SavedOutlier,
  type RadarHistoryEntry,
} from "@/lib/api";
import { compact } from "@/lib/format";
import { cn } from "@/lib/utils";
import { VideoCard } from "./VideoCard";
import { SavedCard } from "./SavedCard";
import { VideoDetail } from "./VideoDetail";

const HUNT_MODES = [
  { id: "early", label: "Garimpo", hint: "Prioriza outliers em canais pequenos" },
  { id: "balanced", label: "Equilíbrio", hint: "Mistura viral + outlier" },
  { id: "safe", label: "Seguro", hint: "Prioriza o que já é viral" },
] as const;

const PERIODS = [
  { v: 7, label: "7 dias" },
  { v: 14, label: "14 dias" },
  { v: 30, label: "30 dias" },
  { v: 90, label: "90 dias" },
];

const SORTS = [
  { id: "opportunity", label: "Oportunidade" },
  { id: "multiplier", label: "Fora da curva (x)" },
  { id: "views", label: "Views" },
  { id: "vph", label: "Velocidade (VPH)" },
  { id: "recent", label: "Mais recentes" },
] as const;

type SortId = (typeof SORTS)[number]["id"];

const MAX_SUBS = [
  { v: 0, label: "todos" },
  { v: 10_000, label: "≤ 10 mil" },
  { v: 50_000, label: "≤ 50 mil" },
  { v: 100_000, label: "≤ 100 mil" },
  { v: 500_000, label: "≤ 500 mil" },
];

function sortVideos(videos: RadarVideo[], sort: SortId): RadarVideo[] {
  const copy = [...videos];
  copy.sort((a, b) => {
    switch (sort) {
      case "multiplier":
        return b.outlier_multiplier - a.outlier_multiplier;
      case "views":
        return b.views - a.views;
      case "vph":
        return b.effective_vph - a.effective_vph;
      case "recent":
        return a.age_hours - b.age_hours;
      default:
        return b.opportunity_score - a.opportunity_score;
    }
  });
  return copy;
}

export function RadarWorkspace() {
  const [config, setConfig] = useState<RadarConfig | null>(null);
  const [query, setQuery] = useState("");
  const [period, setPeriod] = useState(14);
  const [minViews, setMinViews] = useState(50_000);
  const [huntMode, setHuntMode] = useState<RadarSearchParams["hunt_mode"]>("early");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RadarResult | null>(null);

  const [view, setView] = useState<"resultados" | "salvos">("resultados");
  const [sort, setSort] = useState<SortId>("opportunity");
  const [maxSubs, setMaxSubs] = useState(0);

  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [savedList, setSavedList] = useState<SavedOutlier[]>([]);
  const [historyList, setHistoryList] = useState<RadarHistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [selected, setSelected] = useState<RadarVideo | null>(null);

  useEffect(() => {
    api.radar.config().then(setConfig).catch(() => setConfig(null));
    refreshSaved();
  }, []);

  function refreshSaved() {
    api.radar
      .saved()
      .then((list) => {
        setSavedList(list);
        setSavedIds(new Set(list.map((s) => s.video_id)));
      })
      .catch(() => {});
  }

  async function runSearch() {
    if (query.trim().length < 2) {
      setError("Digite um tema com pelo menos 2 caracteres.");
      return;
    }
    setLoading(true);
    setError(null);
    setView("resultados");
    try {
      const res = await api.radar.search({
        query: query.trim(),
        period_days: period,
        video_format: "short",
        min_views: minViews,
        hunt_mode: huntMode,
        depth: "normal",
        max_results: 48,
      });
      setResult(res);
      setConfig((c) => (c ? { ...c, quota_remaining: res.quota_remaining } : c));
      api.radar.history().then(setHistoryList).catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha na busca.");
    } finally {
      setLoading(false);
    }
  }

  async function runRanking() {
    setLoading(true);
    setError(null);
    setView("resultados");
    setQuery("");
    try {
      const res = await api.radar.ranking({
        period_days: period,
        min_views: minViews,
        hunt_mode: huntMode,
        max_results: 48,
      });
      setResult(res);
      setConfig((c) => (c ? { ...c, quota_remaining: res.quota_remaining } : c));
      api.radar.history().then(setHistoryList).catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha no ranking.");
    } finally {
      setLoading(false);
    }
  }

  async function openHistory(id: string) {
    setShowHistory(false);
    setLoading(true);
    setError(null);
    setView("resultados");
    try {
      const res = await api.radar.historyItem(id);
      setResult(res);
      setQuery(res.query);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao abrir histórico.");
    } finally {
      setLoading(false);
    }
  }

  async function toggleSave(video: RadarVideo) {
    const isSaved = savedIds.has(video.video_id);
    // Atualização otimista
    setSavedIds((prev) => {
      const next = new Set(prev);
      isSaved ? next.delete(video.video_id) : next.add(video.video_id);
      return next;
    });
    try {
      if (isSaved) {
        await api.radar.unsave(video.video_id);
      } else {
        await api.radar.save({
          video_id: video.video_id,
          channel_id: video.channel_id,
          title: video.title,
          thumbnail: video.thumbnail,
          views: video.views,
          multiplier: video.outlier_multiplier,
          opportunity_score: video.opportunity_score,
        });
      }
      refreshSaved();
    } catch {
      refreshSaved(); // reverte para o estado real
    }
  }

  async function removeSaved(videoId: string) {
    setSavedIds((prev) => {
      const next = new Set(prev);
      next.delete(videoId);
      return next;
    });
    setSavedList((prev) => prev.filter((s) => s.video_id !== videoId));
    await api.radar.unsave(videoId).catch(() => {});
  }

  const displayed = useMemo(() => {
    if (!result) return [];
    let list = result.videos;
    if (maxSubs > 0) list = list.filter((v) => v.subscribers <= maxSubs);
    return sortVideos(list, sort);
  }, [result, sort, maxSubs]);

  const quotaPct = config
    ? Math.round((config.quota_remaining / config.quota_total) * 100)
    : 100;

  return (
    <>
    <div className="flex h-full flex-col gap-4">
      {/* Barra de busca */}
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runSearch()}
              placeholder="Tema dos shorts (ex.: curiosidades história, fatos espaço…)"
              className="w-full rounded-lg border border-border bg-background py-2.5 pl-10 pr-3 text-sm outline-none focus:border-primary"
            />
          </div>

          <div className="relative">
            <button
              onClick={() => {
                if (!showHistory) api.radar.history().then(setHistoryList).catch(() => {});
                setShowHistory((s) => !s);
              }}
              title="Buscas recentes"
              className="flex h-full items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 text-sm text-muted hover:text-foreground"
            >
              <History className="h-4 w-4" />
            </button>
            {showHistory && (
              <div className="absolute right-0 top-full z-10 mt-1 max-h-80 w-72 overflow-auto rounded-lg border border-border bg-surface shadow-xl">
                {historyList.length === 0 ? (
                  <div className="px-3 py-4 text-center text-xs text-muted">Sem buscas ainda.</div>
                ) : (
                  historyList.map((h) => (
                    <button
                      key={h.id}
                      onClick={() => openHistory(h.id)}
                      className="flex w-full flex-col border-b border-border px-3 py-2 text-left last:border-0 hover:bg-surface-2"
                    >
                      <span className="truncate text-sm font-medium">{h.query}</span>
                      <span className="text-[11px] text-muted">
                        {h.summary.sample_videos} vídeos · maior {h.summary.top_multiplier}x
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          <button
            onClick={runRanking}
            disabled={loading}
            title="Descobrir virais fora da curva sem digitar um tema"
            className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-4 text-sm font-medium text-foreground transition-colors hover:border-primary/50 disabled:opacity-50"
          >
            <Trophy className="h-4 w-4 text-warning" />
            Ranking
          </button>
          <button
            onClick={runSearch}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            {loading ? "Garimpando…" : "Buscar"}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-1.5">
            {HUNT_MODES.map((m) => (
              <button
                key={m.id}
                onClick={() => setHuntMode(m.id)}
                title={m.hint}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  huntMode === m.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-surface-2 text-muted hover:text-foreground",
                )}
              >
                {m.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            {PERIODS.map((p) => (
              <button
                key={p.v}
                onClick={() => setPeriod(p.v)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  period === p.v ? "bg-surface-2 text-foreground" : "text-muted hover:text-foreground",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>

          <label className="flex items-center gap-2 text-xs text-muted">
            mín. views
            <select
              value={minViews}
              onChange={(e) => setMinViews(Number(e.target.value))}
              className="rounded-md border border-border bg-background px-2 py-1 text-foreground outline-none"
            >
              <option value={10_000}>10 mil</option>
              <option value={50_000}>50 mil</option>
              <option value={100_000}>100 mil</option>
              <option value={500_000}>500 mil</option>
              <option value={1_000_000}>1 mi</option>
            </select>
          </label>

          {config && (
            <div className="ml-auto flex items-center gap-2 text-xs text-muted" title="Quota diária da YouTube API restante">
              <Gauge className="h-3.5 w-3.5" />
              <span className={cn(quotaPct < 20 && "text-warning")}>
                quota {compact(config.quota_remaining)}/{compact(config.quota_total)}
              </span>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      {/* Abas + resumo + ordenação */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-lg border border-border bg-surface p-1">
          <button
            onClick={() => setView("resultados")}
            className={cn(
              "rounded-md px-3 py-1 text-xs font-medium transition-colors",
              view === "resultados" ? "bg-surface-2 text-foreground" : "text-muted hover:text-foreground",
            )}
          >
            Resultados{result ? ` (${displayed.length})` : ""}
          </button>
          <button
            onClick={() => setView("salvos")}
            className={cn(
              "flex items-center gap-1 rounded-md px-3 py-1 text-xs font-medium transition-colors",
              view === "salvos" ? "bg-surface-2 text-foreground" : "text-muted hover:text-foreground",
            )}
          >
            <Bookmark className="h-3 w-3" /> Acervo ({savedList.length})
          </button>
        </div>

        {view === "resultados" && result && (
          <>
            <label className="flex items-center gap-2 text-xs text-muted">
              ordenar
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortId)}
                className="rounded-md border border-border bg-background px-2 py-1 text-foreground outline-none"
              >
                {SORTS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-xs text-muted">
              máx. inscritos
              <select
                value={maxSubs}
                onChange={(e) => setMaxSubs(Number(e.target.value))}
                className="rounded-md border border-border bg-background px-2 py-1 text-foreground outline-none"
              >
                {MAX_SUBS.map((m) => (
                  <option key={m.v} value={m.v}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="ml-auto flex items-center gap-3 text-xs text-muted">
              <span>maior outlier <b className="text-primary">{result.summary.top_multiplier}x</b></span>
              <span>mediana <b className="text-foreground">{compact(result.summary.median_views)}</b></span>
              <span>gasto <b className="text-foreground">{result.units_spent}u</b></span>
            </div>
          </>
        )}
      </div>

      {/* Conteúdo */}
      <div className="flex-1 overflow-auto">
        {view === "salvos" ? (
          savedList.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 pb-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {savedList.map((s) => (
                <SavedCard key={s.video_id} item={s} onRemove={removeSaved} />
              ))}
            </div>
          ) : (
            <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted">
              Seu acervo está vazio. Salve os melhores outliers para remodelar depois.
            </div>
          )
        ) : result ? (
          displayed.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 pb-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {displayed.map((v) => (
                <VideoCard
                  key={v.video_id}
                  video={v}
                  saved={savedIds.has(v.video_id)}
                  onToggleSave={toggleSave}
                  onOpen={setSelected}
                />
              ))}
            </div>
          ) : (
            <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted">
              Nenhum vídeo com esses filtros. Afrouxe o "máx. inscritos".
            </div>
          )
        ) : (
          <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted">
            {loading ? "Garimpando shorts fora da curva…" : "Busque um tema para começar o garimpo."}
          </div>
        )}
      </div>
    </div>

      {selected && (
        <VideoDetail
          video={selected}
          saved={savedIds.has(selected.video_id)}
          onToggleSave={toggleSave}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}
