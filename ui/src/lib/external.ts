// Abre URLs externas no navegador do sistema.
// No app Tauri, o webview BLOQUEIA navegação externa (<a target="_blank"> não
// faz nada), então usamos o plugin opener. No navegador (dev), usamos window.open.

let openUrlFn: ((url: string) => Promise<void>) | null = null;
let triedLoad = false;

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function ensureOpener(): Promise<void> {
  if (openUrlFn || triedLoad) return;
  triedLoad = true;
  try {
    const mod = await import("@tauri-apps/plugin-opener");
    openUrlFn = mod.openUrl;
  } catch {
    openUrlFn = null;
  }
}

export async function openExternal(url: string): Promise<void> {
  if (!url) return;
  if (isTauri()) {
    await ensureOpener();
    if (openUrlFn) {
      try {
        await openUrlFn(url);
        return;
      } catch {
        // cai para o window.open abaixo
      }
    }
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

// Interceptador global: captura cliques em <a href="http(s)://..."> e roteia
// pelo opener. Conserta todos os links externos do app de uma vez (Radar,
// Canais, Controle de Posts) sem precisar mexer em cada componente.
export function installExternalLinkHandler(): void {
  if (typeof document === "undefined") return;
  document.addEventListener("click", (event) => {
    if (event.defaultPrevented || event.button !== 0) return;
    const target = event.target as HTMLElement | null;
    const anchor = target?.closest?.("a") as HTMLAnchorElement | null;
    if (!anchor) return;
    const href = anchor.getAttribute("href") || "";
    if (!/^https?:\/\//i.test(href)) return; // só links externos
    event.preventDefault();
    void openExternal(href);
  });
}
