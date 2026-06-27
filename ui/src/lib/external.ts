// Abre URLs externas no navegador do sistema.
// No app Tauri, o webview BLOQUEIA navegação externa (<a target="_blank"> não
// faz nada), então chamamos um comando nativo no Rust (open_external), que é
// mais confiável que o plugin via JS no app empacotado. No navegador (dev),
// usamos window.open.

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function openExternal(url: string): Promise<void> {
  if (!url) return;
  if (isTauri()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("open_external", { url });
      return;
    } catch {
      // cai para o window.open abaixo
    }
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

// Interceptador global: captura cliques em <a href="http(s)://..."> e roteia
// pelo open_external. Conserta todos os links externos do app de uma vez
// (Radar, Canais, Controle de Posts) sem precisar mexer em cada componente.
export function installExternalLinkHandler(): void {
  if (typeof document === "undefined") return;
  document.addEventListener("click", (event) => {
    if (event.defaultPrevented || event.button !== 0) return;
    const target = event.target as HTMLElement | null;
    const anchor = target?.closest?.("a") as HTMLAnchorElement | null;
    if (!anchor) return;
    const href = anchor.getAttribute("href") || "";
    if (!/^https?:\/\//i.test(href)) return; // só links externos
    if (/^https?:\/\/(127\.0\.0\.1|localhost)/i.test(href)) return; // motor local
    event.preventDefault();
    void openExternal(href);
  });
}
