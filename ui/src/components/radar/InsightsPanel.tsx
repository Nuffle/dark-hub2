import { Zap, Users, TrendingUp, Hash, ExternalLink } from "lucide-react";
import type { RadarChannel, RadarKeyword } from "@/lib/api";
import { compact } from "@/lib/format";

export function InsightsPanel({
  channels = [],
  keywords = [],
  onPickKeyword,
}: {
  channels?: RadarChannel[];
  keywords?: RadarKeyword[];
  onPickKeyword: (term: string) => void;
}) {
  const maxCount = keywords.length ? keywords[0].count : 1;

  return (
    <div className="grid grid-cols-1 gap-4 pb-4 lg:grid-cols-2">
      {/* Temas em alta */}
      <div className="rounded-lg border border-border bg-surface p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Hash className="h-4 w-4 text-primary" /> Temas em alta
          <span className="text-xs font-normal text-muted">— clique pra buscar</span>
        </div>
        {keywords.length === 0 ? (
          <div className="text-sm text-muted">Poucos dados para extrair temas.</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {keywords.map((k) => {
              const scale = 0.8 + (k.count / maxCount) * 0.6;
              return (
                <button
                  key={k.term}
                  onClick={() => onPickKeyword(k.term)}
                  className="rounded-full border border-border bg-surface-2 px-3 py-1 text-muted transition-colors hover:border-primary/50 hover:text-foreground"
                  style={{ fontSize: `${scale}rem` }}
                  title={`${k.count}× nos resultados`}
                >
                  {k.term}
                  <span className="ml-1.5 text-[10px] text-muted/70">{k.count}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Canais reveladores */}
      <div className="rounded-lg border border-border bg-surface p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <TrendingUp className="h-4 w-4 text-primary" /> Canais reveladores
          <span className="text-xs font-normal text-muted">— pequenos batendo outliers</span>
        </div>
        {channels.length === 0 ? (
          <div className="text-sm text-muted">Sem canais para mostrar.</div>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {channels.map((c) => (
              <div key={c.channel_id} className="flex items-center gap-3 py-2">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs font-bold text-primary">
                  {c.outlier_count}
                </div>
                <div className="min-w-0 flex-1">
                  <a
                    href={c.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 truncate text-sm font-medium hover:text-primary"
                  >
                    <span className="truncate">{c.title || c.channel_id}</span>
                    <ExternalLink className="h-3 w-3 shrink-0 text-muted" />
                  </a>
                  <div className="flex items-center gap-3 text-[11px] text-muted">
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3" /> {compact(c.subscribers)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Zap className="h-3 w-3" /> até {c.best_multiplier}x
                    </span>
                    <span>média {compact(c.average_views)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
