/**
 * Electron kasa gün boyu açık kalınca bellek / sayaç birikimini sınırlar.
 */
import { queryCache } from './queryCache';

const HYGIENE_MS = 30 * 60 * 1000;

export function isElectronRuntime(): boolean {
  return typeof window !== 'undefined' && !!(window as { electronAPI?: unknown }).electronAPI;
}

export function installElectronSessionHygiene(): void {
  if (!isElectronRuntime()) return;

  const run = () => {
    if (typeof document !== 'undefined' && document.visibilityState !== 'hidden') {
      queryCache.pruneStaleInMemory();
    }
  };

  window.setTimeout(run, HYGIENE_MS);
  window.setInterval(run, HYGIENE_MS);
}
