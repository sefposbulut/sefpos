/**
 * Yerel dev: ilk yükleme sonrası konsola performans özeti (Adım 2–3).
 * Prod build'e dahil edilmez.
 */
import {
  analyzeDiagnostics,
  exportDiagnosticsJson,
  getDiagnosticsSnapshot,
} from './resourceDiagnostics';

declare global {
  interface Window {
    __sefposPerfReport?: () => string;
    __sefposOpenDiagnostics?: () => void;
  }
}

function logPerfSummary(label: string): void {
  const snap = getDiagnosticsSnapshot();
  const insights = analyzeDiagnostics(snap);
  const httpTotal = snap.http.reduce((s, h) => s + h.count, 0);
  const pollTotal = snap.polls.reduce((s, p) => s + p.count, 0);

  console.group(`[ŞefPOS perf] ${label}`);
  console.info('Son 5 dk Supabase/API (Fetch/XHR benzeri):', snap.http.slice(0, 12));
  console.info(`Toplam kayıtlı HTTP: ${httpTotal}, poll tick: ${pollTotal}`);
  console.info(`Realtime kanalları (${snap.realtimeChannels.length}):`, snap.realtimeChannels);
  if (snap.memory) {
    console.info(
      `JS heap: ${snap.memory.jsHeapUsedMb ?? '?'} / ${snap.memory.jsHeapLimitMb ?? '?'} MB`,
    );
  }
  if (insights.length) {
    console.warn(
      'Uyarılar:',
      insights.map((i) => `[${i.severity}] ${i.title}`),
    );
  }
  console.info('Detay panel: Ayarlar → Sistem → Kasa tanılama (aşağı kaydır)');
  console.info('Tekrar ölçüm: window.__sefposPerfReport()');
  console.groupEnd();
}

export function installDevPerfBoot(): void {
  if (!import.meta.env.DEV || typeof window === 'undefined') return;

  window.__sefposPerfReport = () => {
    const snap = getDiagnosticsSnapshot();
    const insights = analyzeDiagnostics(snap);
    return exportDiagnosticsJson(snap, insights);
  };

  window.__sefposOpenDiagnostics = () => {
    window.dispatchEvent(new CustomEvent('sefpos:open-settings-tab', { detail: { tab: 'system' } }));
  };

  window.setTimeout(() => logPerfSummary('ilk 10 sn (Network Clear sonrası yenile)'), 10_000);
  window.setTimeout(() => logPerfSummary('30 sn leak kontrolü'), 30_000);
}
