// Verificação e instalação de atualizações (só no app Tauri).
import type { Update } from "@tauri-apps/plugin-updater";
import { isTauri } from "./external";

let pending: Update | null = null;

export type UpdateInfo = { version: string; notes: string };

export async function checkForUpdate(): Promise<UpdateInfo | null> {
  if (!isTauri()) return null;
  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    pending = await check();
    if (!pending) return null;
    return { version: pending.version, notes: pending.body ?? "" };
  } catch {
    return null;
  }
}

export async function installPending(onProgress?: (pct: number) => void): Promise<void> {
  if (!pending) return;
  const { relaunch } = await import("@tauri-apps/plugin-process");
  let downloaded = 0;
  let total = 0;
  await pending.downloadAndInstall((event) => {
    if (event.event === "Started") {
      total = event.data.contentLength ?? 0;
    } else if (event.event === "Progress") {
      downloaded += event.data.chunkLength;
      if (total > 0 && onProgress) onProgress(Math.round((downloaded / total) * 100));
    }
  });
  await relaunch();
}
