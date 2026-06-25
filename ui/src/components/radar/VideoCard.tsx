import { Eye, Users, Zap, TrendingUp, ExternalLink, Bookmark } from "lucide-react";
import type { RadarVideo } from "@/lib/api";
import { compact, ageLabel, durationLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

const SIGNAL = {
  exploding: { label: "explodindo", cls: "bg-danger/15 text-danger border-danger/30" },
  rising: { label: "subindo", cls: "bg-warning/15 text-warning border-warning/30" },
  watch: { label: "observar", cls: "bg-muted/15 text-muted border-border" },
} as const;

function multiplierTone(m: number): string {
  if (m >= 10) return "bg-danger text-white";
  if (m >= 5) return "bg-warning text-black";
  if (m >= 2) return "bg-primary text-white";
  return "bg-surface-2 text-muted";
}

export function VideoCard({
  video,
  saved,
  onToggleSave,
  onOpen,
}: {
  video: RadarVideo;
  saved?: boolean;
  onToggleSave?: (video: RadarVideo) => void;
  onOpen?: (video: RadarVideo) => void;
}) {
  const signal = SIGNAL[video.signal];
  return (
    <div className="group flex flex-col overflow-hidden rounded-lg border border-border bg-surface transition-colors hover:border-primary/50">
      <button
        type="button"
        onClick={() => onOpen?.(video)}
        className="relative block aspect-video w-full cursor-pointer overflow-hidden bg-surface-2 text-left"
      >
        {video.thumbnail ? (
          <img
            src={video.thumbnail}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform group-hover:scale-[1.03]"
          />
        ) : null}
        {/* Multiplier — a métrica estrela: "fora da curva" */}
        <div
          className={cn(
            "absolute left-2 top-2 flex items-center gap-1 rounded-md px-2 py-1 text-sm font-bold shadow",
            multiplierTone(video.outlier_multiplier),
          )}
          title="Quantas vezes o vídeo rendeu acima da média do canal"
        >
          <Zap className="h-3.5 w-3.5" />
          {video.outlier_multiplier}x
        </div>
        <div className={cn("absolute right-2 top-2 rounded-md border px-2 py-0.5 text-[11px] font-medium", signal.cls)}>
          {signal.label}
        </div>
        {video.duration ? (
          <div className="absolute bottom-2 right-2 rounded bg-black/75 px-1.5 py-0.5 text-[11px] font-medium text-white">
            {durationLabel(video.duration)}
          </div>
        ) : null}
      </button>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <a
          href={video.url}
          target="_blank"
          rel="noreferrer"
          className="line-clamp-2 text-sm font-medium leading-snug hover:text-primary"
          title={video.title}
        >
          {video.title}
        </a>

        <a
          href={video.channel_url}
          target="_blank"
          rel="noreferrer"
          className="truncate text-xs text-muted hover:text-foreground"
        >
          {video.channel_title}
        </a>

        <div className="mt-auto grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted">
          <span className="flex items-center gap-1">
            <Eye className="h-3.5 w-3.5" /> {compact(video.views)}
          </span>
          <span className="flex items-center gap-1">
            <Users className="h-3.5 w-3.5" /> {compact(video.subscribers)}
          </span>
          <span className="flex items-center gap-1">
            <TrendingUp className="h-3.5 w-3.5" /> {compact(video.effective_vph)}/h
          </span>
          <span>{ageLabel(video.age_hours)}</span>
        </div>

        <div className="flex items-center justify-between border-t border-border pt-2">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-muted">oportunidade</span>
            <span className="rounded bg-surface-2 px-1.5 py-0.5 text-xs font-bold text-foreground">
              {video.opportunity_score}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {onToggleSave && (
              <button
                onClick={() => onToggleSave(video)}
                title={saved ? "Remover do acervo" : "Salvar no acervo"}
                className={cn(
                  "flex items-center transition-colors",
                  saved ? "text-primary" : "text-muted hover:text-foreground",
                )}
              >
                <Bookmark className={cn("h-4 w-4", saved && "fill-current")} />
              </button>
            )}
            <a
              href={video.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-[11px] text-muted transition-opacity hover:text-primary"
            >
              abrir <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
