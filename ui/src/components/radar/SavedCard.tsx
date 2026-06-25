import { Zap, Eye, ExternalLink, Trash2 } from "lucide-react";
import type { SavedOutlier } from "@/lib/api";
import { compact } from "@/lib/format";
import { cn } from "@/lib/utils";

function multiplierTone(m: number): string {
  if (m >= 10) return "bg-danger text-white";
  if (m >= 5) return "bg-warning text-black";
  if (m >= 2) return "bg-primary text-white";
  return "bg-surface-2 text-muted";
}

export function SavedCard({
  item,
  onRemove,
}: {
  item: SavedOutlier;
  onRemove: (videoId: string) => void;
}) {
  const url = `https://www.youtube.com/shorts/${item.video_id}`;
  return (
    <div className="group flex flex-col overflow-hidden rounded-lg border border-border bg-surface transition-colors hover:border-primary/50">
      <div className="relative aspect-video overflow-hidden bg-surface-2">
        {item.thumbnail ? (
          <img src={item.thumbnail} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : null}
        <div
          className={cn(
            "absolute left-2 top-2 flex items-center gap-1 rounded-md px-2 py-1 text-sm font-bold shadow",
            multiplierTone(item.multiplier),
          )}
        >
          <Zap className="h-3.5 w-3.5" />
          {item.multiplier}x
        </div>
        <button
          onClick={() => onRemove(item.video_id)}
          title="Remover do acervo"
          className="absolute right-2 top-2 rounded-md bg-black/60 p-1.5 text-white opacity-0 transition-opacity hover:bg-danger group-hover:opacity-100"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="line-clamp-2 text-sm font-medium leading-snug hover:text-primary"
          title={item.title}
        >
          {item.title || item.video_id}
        </a>
        <div className="mt-auto flex items-center justify-between border-t border-border pt-2 text-xs text-muted">
          <span className="flex items-center gap-1">
            <Eye className="h-3.5 w-3.5" /> {compact(item.views)}
          </span>
          <span className="flex items-center gap-1.5">
            <span>
              opp <b className="text-foreground">{item.opportunity_score}</b>
            </span>
            <a href={url} target="_blank" rel="noreferrer" className="hover:text-primary">
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </span>
        </div>
      </div>
    </div>
  );
}
