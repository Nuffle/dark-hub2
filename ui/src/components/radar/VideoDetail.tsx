import { useEffect, useState } from "react";
import {
  X,
  Zap,
  Bookmark,
  ExternalLink,
  Play,
  Copy,
  Check,
} from "lucide-react";
import type { RadarVideo } from "@/lib/api";
import { compact, ageLabel, durationLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

function Metric({ label, value, tone }: { label: string; value: string; tone?: "primary" }) {
  return (
    <div className="rounded-lg border border-border bg-surface-2 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted">{label}</div>
      <div className={cn("text-base font-bold", tone === "primary" ? "text-primary" : "text-foreground")}>
        {value}
      </div>
    </div>
  );
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-[11px] text-muted">
        <span>{label}</span>
        <span className="text-foreground">{value}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, value)}%` }} />
      </div>
    </div>
  );
}

export function VideoDetail({
  video,
  saved,
  onToggleSave,
  onClose,
}: {
  video: RadarVideo;
  saved: boolean;
  onToggleSave: (v: RadarVideo) => void;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function copyIdea() {
    const brief = [
      `IDEIA — ${video.title}`,
      `Canal: ${video.channel_title} (${compact(video.subscribers)} inscritos)`,
      `Fora da curva: ${video.outlier_multiplier}x | Views: ${compact(video.views)} | Oportunidade: ${video.opportunity_score}`,
      `Referência: ${video.url}`,
    ].join("\n");
    navigator.clipboard.writeText(brief).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-md flex-col overflow-auto border-l border-border bg-surface shadow-2xl">
        <div className="relative aspect-video shrink-0 bg-surface-2">
          {video.thumbnail ? (
            <img src={video.thumbnail} alt="" className="h-full w-full object-cover" />
          ) : null}
          <button
            onClick={onClose}
            className="absolute right-3 top-3 rounded-full bg-black/60 p-1.5 text-white hover:bg-black/80"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="absolute left-3 top-3 flex items-center gap-1 rounded-md bg-danger px-2 py-1 text-sm font-bold text-white">
            <Zap className="h-3.5 w-3.5" /> {video.outlier_multiplier}x fora da curva
          </div>
          {video.duration ? (
            <div className="absolute bottom-3 right-3 rounded bg-black/75 px-1.5 py-0.5 text-xs font-medium text-white">
              {durationLabel(video.duration)}
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-4 p-5">
          <div>
            <h2 className="text-base font-semibold leading-snug">{video.title}</h2>
            <a
              href={video.channel_url}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-block text-sm text-muted hover:text-foreground"
            >
              {video.channel_title} · {compact(video.subscribers)} inscritos
            </a>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Metric label="views" value={compact(video.views)} />
            <Metric label="fora da curva" value={`${video.outlier_multiplier}x`} tone="primary" />
            <Metric label="oportunidade" value={String(video.opportunity_score)} tone="primary" />
            <Metric label="VPH efetivo" value={`${compact(video.effective_vph)}/h`} />
            <Metric label="média do canal" value={compact(video.channel_avg_views)} />
            <Metric label="idade" value={ageLabel(video.age_hours)} />
            <Metric label="engajamento" value={`${video.engagement_rate}%`} />
            <Metric label="views/inscrito" value={`${video.view_sub_ratio}x`} />
            <Metric label="likes" value={compact(video.likes)} />
          </div>

          <div className="flex flex-col gap-2.5 rounded-lg border border-border p-3">
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted">decomposição do score</div>
            <ScoreBar label="Viralidade" value={video.viral_score} />
            <ScoreBar label="Fora da curva (outlier)" value={video.outlier_score} />
            <ScoreBar label="Replicabilidade" value={video.remix_score} />
            <ScoreBar label="Frescor" value={video.freshness_score} />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <a
              href={video.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              <Play className="h-4 w-4" /> Abrir short
            </a>
            <button
              onClick={() => onToggleSave(video)}
              className={cn(
                "flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors",
                saved
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-surface-2 text-foreground hover:border-primary/50",
              )}
            >
              <Bookmark className={cn("h-4 w-4", saved && "fill-current")} />
              {saved ? "Salvo" : "Salvar"}
            </button>
            <a
              href={video.channel_url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm font-medium hover:border-primary/50"
            >
              <ExternalLink className="h-4 w-4" /> Ver canal
            </a>
            <button
              onClick={copyIdea}
              title="Copia um resumo da ideia (futuramente irá direto para Anotações)"
              className="flex items-center justify-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm font-medium hover:border-primary/50"
            >
              {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copiado!" : "Copiar ideia"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
