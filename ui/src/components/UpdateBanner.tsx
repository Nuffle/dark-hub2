import { useEffect, useState } from "react";
import { Download, Loader2, X } from "lucide-react";
import { checkForUpdate, installPending, type UpdateInfo } from "@/lib/updater";

export function UpdateBanner() {
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // checa ao abrir (e a cada 6h enquanto aberto)
    checkForUpdate().then(setUpdate);
    const id = setInterval(() => checkForUpdate().then(setUpdate), 6 * 60 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  if (!update || dismissed) return null;

  async function install() {
    setInstalling(true);
    try {
      await installPending(setProgress);
      // após instalar, o app reinicia sozinho (relaunch)
    } catch {
      setInstalling(false);
    }
  }

  return (
    <div className="flex items-center gap-3 border-b border-primary/30 bg-primary/10 px-6 py-2 text-sm">
      <Download className="h-4 w-4 shrink-0 text-primary" />
      <span className="flex-1">
        <b>Nova versão {update.version}</b> disponível.
        {installing && progress > 0 ? ` Baixando… ${progress}%` : ""}
      </span>
      <button
        onClick={install}
        disabled={installing}
        className="flex items-center gap-2 rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
      >
        {installing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        {installing ? "Atualizando…" : "Atualizar agora"}
      </button>
      {!installing && (
        <button onClick={() => setDismissed(true)} title="Depois" className="text-muted hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
