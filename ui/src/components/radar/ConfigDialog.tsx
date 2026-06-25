import { useEffect, useState } from "react";
import { X, KeyRound, Check, Loader2 } from "lucide-react";
import { api, type RadarConfig } from "@/lib/api";
import { compact } from "@/lib/format";

export function ConfigDialog({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: (config: RadarConfig) => void;
}) {
  const [config, setConfig] = useState<RadarConfig | null>(null);
  const [key, setKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.radar.config().then(setConfig).catch(() => {});
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function save() {
    if (key.trim().length < 10) {
      setError("Cole uma chave válida da YouTube Data API.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await api.radar.setKey(key.trim());
      setConfig(updated);
      onSaved(updated);
      setKey("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-xl border border-border bg-surface p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <KeyRound className="h-4 w-4 text-primary" /> Chave da YouTube Data API
          </h2>
          <button onClick={onClose} className="text-muted hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-3 flex items-center justify-between rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm">
          <span className="text-muted">Status</span>
          {config?.youtube_api_configured ? (
            <span className="flex items-center gap-1 text-success">
              <Check className="h-4 w-4" /> configurada
            </span>
          ) : (
            <span className="text-warning">não configurada</span>
          )}
        </div>

        {config && (
          <div className="mb-4 flex items-center justify-between rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm">
            <span className="text-muted">Quota hoje</span>
            <span>
              {compact(config.quota_used)} / {compact(config.quota_total)} usadas
            </span>
          </div>
        )}

        <label className="mb-1 block text-xs text-muted">
          {config?.youtube_api_configured ? "Substituir chave" : "Colar chave"}
        </label>
        <input
          value={key}
          onChange={(e) => setKey(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          type="password"
          placeholder="AIza…"
          className="mb-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        />
        <p className="mb-4 text-[11px] text-muted">
          A chave fica só na sua máquina (SQLite local) e nunca vai para o Git.
        </p>

        {error && <div className="mb-3 text-sm text-danger">{error}</div>}

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-border bg-surface-2 px-4 py-2 text-sm hover:border-primary/50"
          >
            Fechar
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}
