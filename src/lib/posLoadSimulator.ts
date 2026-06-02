/**
 * Kasa yük botu — paket, masa, online, ana sayfa vb. sırayla açılır;
 * tanılama sayacları birikir, rapor üretilir. Canlı müşteri verisine yazmaz.
 */

import {
  analyzeDiagnostics,
  exportDiagnosticsJson,
  getDiagnosticsSnapshot,
  type DiagnosticInsight,
  type DiagnosticsSnapshot,
} from './resourceDiagnostics';
import { getActivePosPage } from './pageActivity';
import { getPosStressHooks } from './posStressBridge';
import { touchUserActivity } from './pollSchedule';

const STRESS_REPORT_KEY = 'sefpos_last_stress_report';

const STRESS_CORE_PAGES = [
  'tables',
  'takeaway',
  'online-orders',
  'products',
  'customers',
  'loyalty',
  'quick-sale',
] as const;

/** Electron + Web + masaüstü — platforma göre ana sayfa eklenir. */
export function getStressTestPages(): string[] {
  const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI;
  if (isElectron) return ['desktop-home', ...STRESS_CORE_PAGES];
  return [...STRESS_CORE_PAGES];
}

export function getStressPlatformLabel(): 'Electron' | 'Web' {
  return typeof window !== 'undefined' && !!(window as any).electronAPI ? 'Electron' : 'Web';
}

export type StressStepSample = {
  at: string;
  page: string;
  snapshot: DiagnosticsSnapshot;
  insights: DiagnosticInsight[];
};

export type StressTestReport = {
  startedAt: string;
  endedAt: string;
  durationMs: number;
  stepMs: number;
  premountAll: boolean;
  startPage: string;
  endPage: string;
  steps: StressStepSample[];
  summary: {
    maxRealtimeChannels: number;
    maxMountedPages: number;
    maxJsHeapMb: number;
    criticalCount: number;
    warnCount: number;
  };
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => window.setTimeout(r, ms));
}

let running = false;
let abortRequested = false;

export function isPosLoadSimulationRunning(): boolean {
  return running;
}

export function stopPosLoadSimulation(): void {
  abortRequested = true;
}

export type RunStressOpts = {
  durationMs?: number;
  stepMs?: number;
  premountAll?: boolean;
  onProgress?: (info: { page: string; elapsedMs: number; channels: number }) => void;
};

/**
 * Gerçek ekran geçişleri + isteğe bağlı tüm hub sayfalarını premount.
 * Settings açıkken çalıştırın; süre bitince başlangıç sayfasına döner.
 */
export async function runPosLoadSimulation(opts: RunStressOpts = {}): Promise<StressTestReport> {
  const bridge = getPosStressHooks();
  if (!bridge) {
    throw new Error('Yük testi başlatılamadı: uygulama henüz hazır değil. Ana ekrana dönüp tekrar deneyin.');
  }
  if (running) {
    throw new Error('Zaten bir yük testi çalışıyor.');
  }

  running = true;
  abortRequested = false;

  const durationMs = Math.max(30_000, opts.durationMs ?? 90_000);
  const stepMs = Math.max(5_000, opts.stepMs ?? 10_000);
  const premountAll = opts.premountAll !== false;
  const startPage = getActivePosPage();
  const startedAt = new Date().toISOString();
  const steps: StressStepSample[] = [];

  const pages = getStressTestPages();

  if (premountAll) {
    bridge.premount(pages);
    await sleep(800);
  }

  const t0 = Date.now();
  let pageIndex = 0;

  try {
    while (Date.now() - t0 < durationMs && !abortRequested) {
      const page = pages[pageIndex % pages.length];
      touchUserActivity();
      bridge.navigate(page);
      await sleep(1200);

      const snap = getDiagnosticsSnapshot();
      const insights = analyzeDiagnostics(snap);
      steps.push({ at: new Date().toISOString(), page, snapshot: snap, insights });
      opts.onProgress?.({
        page,
        elapsedMs: Date.now() - t0,
        channels: snap.realtimeChannels.length,
      });

      const remain = stepMs - 1200;
      if (remain > 0) await sleep(remain);
      pageIndex += 1;
    }
  } finally {
    bridge.navigate(startPage);
    running = false;
    abortRequested = false;
  }

  const endedAt = new Date().toISOString();
  let maxRealtimeChannels = 0;
  let maxMountedPages = 0;
  let maxJsHeapMb = 0;
  let criticalCount = 0;
  let warnCount = 0;

  for (const s of steps) {
    maxRealtimeChannels = Math.max(maxRealtimeChannels, s.snapshot.realtimeChannels.length);
    maxMountedPages = Math.max(maxMountedPages, s.snapshot.mountedPages.length);
    maxJsHeapMb = Math.max(maxJsHeapMb, s.snapshot.memory?.jsHeapUsedMb ?? 0);
    for (const i of s.insights) {
      if (i.severity === 'critical') criticalCount += 1;
      if (i.severity === 'warn') warnCount += 1;
    }
  }

  const report: StressTestReport = {
    startedAt,
    endedAt,
    durationMs: Date.now() - t0,
    stepMs,
    premountAll,
    startPage,
    endPage: startPage,
    steps,
    summary: {
      maxRealtimeChannels,
      maxMountedPages,
      maxJsHeapMb,
      criticalCount,
      warnCount,
    },
  };

  try {
    sessionStorage.setItem(STRESS_REPORT_KEY, JSON.stringify(report));
  } catch {
    /* ignore */
  }
  return report;
}

export function loadLastStressTestReport(): StressTestReport | null {
  try {
    const raw = sessionStorage.getItem(STRESS_REPORT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StressTestReport;
  } catch {
    return null;
  }
}

export function exportStressTestJson(report: StressTestReport): string {
  const finalInsights = report.steps.length
    ? report.steps[report.steps.length - 1].insights
    : [];
  return JSON.stringify(
    {
      report,
      exportNote: 'ŞefPOS kasa yük simülasyonu — destek için gönderin',
      finalDiagnostics: report.steps.length
        ? exportDiagnosticsJson(
            report.steps[report.steps.length - 1].snapshot,
            finalInsights,
          )
        : null,
    },
    null,
    2,
  );
}
