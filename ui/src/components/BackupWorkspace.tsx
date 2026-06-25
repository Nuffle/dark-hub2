import { useEffect, useRef, useState } from "react";
import {
  Download,
  Upload,
  ShieldCheck,
  Loader2,
  CloudOff,
  Check,
  AlertTriangle,
} from "lucide-react";
import { api, type BackupSummary, type BackupSnapshot } from "@/lib/api";

const TABLE_LABELS: Record<string, string> = {
  settings: "Configurações (inclui a chave da API)",
  channels: "Canais",
  notes: "Anotações",
  radar_outliers: "Acervo de outliers",
  radar_runs: "Buscas no histórico",
  video_snapshots: "Snapshots de vídeos (VPH)",
  quota_log: "Registro de quota",
};

export function BackupWorkspace() {
  const [summary, setSummary] = useState<BackupSummary | null>(null);
  const [busy, setBusy] = useState<"export" | "import" | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    refresh();
  }, []);

  function refresh() {
    api.backup.summary().then(setSummary).catch(() => {});
  }

  async function doExport() {
    setBusy("export");
    setMessage(null);
    try {
      const snap = await api.backup.export();
      const blob = new Blob([JSON.stringify(snap, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const date = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `dark-hub-backup-${date}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setMessage({ kind: "ok", text: "Backup exportado. Guarde o arquivo num lugar seguro (Drive, HD externo)." });
    } catch (e) {
      setMessage({ kind: "err", text: e instanceof Error ? e.message : "Falha ao exportar." });
    } finally {
      setBusy(null);
    }
  }

  async function onFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const confirmed = window.confirm(
      "Restaurar vai SUBSTITUIR os dados atuais pelos do backup. " +
        "Um backup de segurança do estado atual é criado automaticamente antes. Continuar?",
    );
    if (!confirmed) return;
    setBusy("import");
    setMessage(null);
    try {
      const text = await file.text();
      const snapshot = JSON.parse(text) as BackupSnapshot;
      const result = await api.backup.import(snapshot);
      const total = Object.values(result.restored).reduce((a, b) => a + b, 0);
      setMessage({ kind: "ok", text: `Restaurado: ${total} registros. Segurança salva em ${result.safety_backup}.` });
      refresh();
    } catch (e) {
      setMessage({ kind: "err", text: e instanceof Error ? e.message : "Arquivo inválido." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col gap-4 overflow-auto">
      {/* O que está guardado */}
      <div className="rounded-lg border border-border bg-surface p-5">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <ShieldCheck className="h-4 w-4 text-primary" /> O que será salvo
        </h2>
        <div className="flex flex-col divide-y divide-border">
          {summary
            ? Object.entries(summary.counts).map(([table, count]) => (
                <div key={table} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-muted">{TABLE_LABELS[table] ?? table}</span>
                  <span className="font-medium">{count}</span>
                </div>
              ))
            : <div className="py-2 text-sm text-muted">Carregando…</div>}
        </div>
        {summary?.last_local_backup && (
          <p className="mt-3 text-[11px] text-muted">
            Último backup de segurança interno: {summary.last_local_backup}
          </p>
        )}
      </div>

      {/* Ações */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button
          onClick={doExport}
          disabled={busy !== null}
          className="flex flex-col items-start gap-2 rounded-lg border border-border bg-surface p-4 text-left transition-colors hover:border-primary/50 disabled:opacity-50"
        >
          <div className="flex items-center gap-2 font-medium">
            {busy === "export" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4 text-primary" />}
            Exportar backup
          </div>
          <span className="text-xs text-muted">Baixa um arquivo .json com todos os seus dados.</span>
        </button>

        <button
          onClick={() => fileRef.current?.click()}
          disabled={busy !== null}
          className="flex flex-col items-start gap-2 rounded-lg border border-border bg-surface p-4 text-left transition-colors hover:border-primary/50 disabled:opacity-50"
        >
          <div className="flex items-center gap-2 font-medium">
            {busy === "import" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4 text-primary" />}
            Restaurar backup
          </div>
          <span className="text-xs text-muted">Substitui os dados atuais pelos de um arquivo .json.</span>
        </button>
        <input ref={fileRef} type="file" accept="application/json,.json" onChange={onFilePicked} className="hidden" />
      </div>

      {message && (
        <div
          className={
            "flex items-start gap-2 rounded-lg border px-4 py-3 text-sm " +
            (message.kind === "ok"
              ? "border-success/30 bg-success/10 text-success"
              : "border-danger/30 bg-danger/10 text-danger")
          }
        >
          {message.kind === "ok" ? <Check className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
          <span>{message.text}</span>
        </div>
      )}

      {/* Perna 2 — Cloudflare (em breve) */}
      <div className="rounded-lg border border-dashed border-border bg-surface/50 p-4">
        <div className="flex items-center gap-2 text-sm font-medium text-muted">
          <CloudOff className="h-4 w-4" /> Sincronização automática na nuvem — em breve
        </div>
        <p className="mt-1 text-xs text-muted">
          Por enquanto, a portabilidade é por arquivo: exporte e guarde no Drive/HD. A
          próxima etapa pluga o Cloudflare para empurrar/puxar esse backup
          automaticamente, de qualquer máquina.
        </p>
      </div>
    </div>
  );
}
