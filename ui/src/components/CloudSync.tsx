import { useEffect, useState } from "react";
import {
  Cloud,
  CloudUpload,
  CloudDownload,
  Loader2,
  Check,
  AlertTriangle,
  Settings,
} from "lucide-react";
import { api, type CloudStatus } from "@/lib/api";
import { cn } from "@/lib/utils";

function fmtBytes(n: number): string {
  if (!n) return "0 B";
  const u = ["B", "KB", "MB", "GB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${u[i]}`;
}

function UsageBar({
  label,
  used,
  limit,
  render,
}: {
  label: string;
  used: number;
  limit: number;
  render: (n: number) => string;
}) {
  const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
  const tone = pct >= 90 ? "bg-danger" : pct >= 70 ? "bg-warning" : "bg-primary";
  return (
    <div>
      <div className="mb-1 flex justify-between text-[11px]">
        <span className="text-muted">{label}</span>
        <span className={cn(pct >= 90 ? "text-danger" : pct >= 70 ? "text-warning" : "text-muted")}>
          {render(used)} / {render(limit)}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div className={cn("h-full rounded-full transition-all", tone)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function CloudSync() {
  const [status, setStatus] = useState<CloudStatus | null>(null);
  const [busy, setBusy] = useState<"push" | "pull" | "save" | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [editing, setEditing] = useState(false);
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");

  useEffect(() => {
    refresh();
  }, []);

  function refresh() {
    api.cloud
      .status()
      .then((s) => {
        setStatus(s);
        if (s.url) setUrl(s.url);
        if (!s.configured) setEditing(true);
      })
      .catch(() => {});
  }

  async function saveConfig() {
    setBusy("save");
    setMsg(null);
    try {
      const s = await api.cloud.setConfig(url.trim(), token.trim());
      setStatus(s);
      setEditing(false);
      setToken("");
      setMsg(s.connected ? { kind: "ok", text: "Conectado à nuvem." } : { kind: "err", text: s.error || "Não conectou." });
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Falha ao salvar." });
    } finally {
      setBusy(null);
    }
  }

  async function push() {
    setBusy("push");
    setMsg(null);
    try {
      const r = await api.cloud.push();
      const sons = r.sounds_uploaded ? ` · ${r.sounds_uploaded} som(ns) enviados` : "";
      setMsg({ kind: "ok", text: `Enviado para a nuvem (revisão ${r.revision}, ${fmtBytes(r.size_bytes)})${sons}.` });
      refresh();
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Falha ao enviar." });
    } finally {
      setBusy(null);
    }
  }

  async function pull() {
    if (!window.confirm("Trazer da nuvem vai SUBSTITUIR os dados locais pelos da nuvem (um backup de segurança é criado antes). Continuar?")) return;
    setBusy("pull");
    setMsg(null);
    try {
      const r = await api.cloud.pull();
      const total = Object.values(r.restored).reduce((a, b) => a + b, 0);
      const sons = r.sounds_downloaded ? ` · ${r.sounds_downloaded} som(ns) baixados` : "";
      setMsg({ kind: "ok", text: `Trazido da nuvem: ${total} registros${sons}.` });
      refresh();
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Falha ao trazer." });
    } finally {
      setBusy(null);
    }
  }

  const usage = status?.usage;

  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Cloud className="h-4 w-4 text-primary" /> Sincronização na nuvem
        </h2>
        <div className="flex items-center gap-2">
          {status && (
            <span
              className={cn(
                "flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]",
                status.connected
                  ? "bg-success/15 text-success"
                  : status.configured
                    ? "bg-danger/15 text-danger"
                    : "bg-muted/15 text-muted",
              )}
            >
              <span className={cn("h-1.5 w-1.5 rounded-full", status.connected ? "bg-success" : status.configured ? "bg-danger" : "bg-muted")} />
              {status.connected ? "conectado" : status.configured ? "erro" : "não configurada"}
            </span>
          )}
          <button onClick={() => setEditing((e) => !e)} title="Configurar" className="text-muted hover:text-foreground">
            <Settings className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {editing && (
        <div className="mb-4 flex flex-col gap-2 rounded-lg border border-border bg-surface-2 p-3">
          <label className="block">
            <span className="mb-1 block text-[11px] text-muted">URL do Worker</span>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://...workers.dev"
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none focus:border-primary"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] text-muted">Token</span>
            <input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              type="password"
              placeholder={status?.configured ? "•••••• (deixe vazio para manter)" : "cole o token"}
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none focus:border-primary"
            />
          </label>
          <button
            onClick={saveConfig}
            disabled={busy === "save"}
            className="flex items-center justify-center gap-2 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {busy === "save" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Salvar e conectar
          </button>
        </div>
      )}

      {usage && (
        <div className="mb-4 flex flex-col gap-2.5">
          <UsageBar label="Armazenamento (R2)" used={usage.used_bytes} limit={usage.limit_bytes} render={fmtBytes} />
          <UsageBar label="Arquivos" used={usage.total_files} limit={usage.max_files} render={(n) => String(n)} />
          <UsageBar label="Operações de escrita (mês)" used={usage.operations.class_a} limit={usage.operations.class_a_limit} render={(n) => n.toLocaleString("pt-BR")} />
          <UsageBar label="Operações de leitura (mês)" used={usage.operations.class_b} limit={usage.operations.class_b_limit} render={(n) => n.toLocaleString("pt-BR")} />
          {(usage.percentage >= 90 || usage.operations.class_a / usage.operations.class_a_limit >= 0.9) && (
            <div className="flex items-center gap-1.5 text-[11px] text-danger">
              <AlertTriangle className="h-3.5 w-3.5" /> Perto do limite grátis — o Worker bloqueia antes de gerar custo.
            </div>
          )}
        </div>
      )}

      {msg && (
        <div
          className={cn(
            "mb-3 flex items-start gap-2 rounded-lg border px-3 py-2 text-xs",
            msg.kind === "ok" ? "border-success/30 bg-success/10 text-success" : "border-danger/30 bg-danger/10 text-danger",
          )}
        >
          {msg.kind === "ok" ? <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
          <span>{msg.text}</span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={push}
          disabled={!status?.connected || busy !== null}
          className="flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40"
        >
          {busy === "push" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudUpload className="h-4 w-4" />}
          Enviar
        </button>
        <button
          onClick={pull}
          disabled={!status?.connected || busy !== null}
          className="flex items-center justify-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm font-medium hover:border-primary/50 disabled:opacity-40"
        >
          {busy === "pull" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudDownload className="h-4 w-4" />}
          Trazer
        </button>
      </div>

      {status?.revision != null && status.revision > 0 && (
        <p className="mt-2 text-center text-[11px] text-muted">
          Na nuvem: revisão {status.revision}
          {status.remote_size_bytes ? ` · ${fmtBytes(status.remote_size_bytes)}` : ""}
        </p>
      )}
      <p className="mt-1 text-center text-[11px] text-muted">
        Sincroniza todos os dados e os arquivos de som (R2). Formatou? Reinstale e clique em Trazer.
      </p>
    </div>
  );
}
