/**
 * Kasa performans tanılama — HTTP, poll, Realtime kanalları.
 * Yapay zeka değil; son 5 dk sayaçları + kural tabanlı öneriler (destek / sahip).
 */

import type { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import { getActivePosPage } from './pageActivity';

const WINDOW_MS = 5 * 60 * 1000;
const PRUNE_EVERY_MS = 30_000;

type Bucket = { count: number; lastAt: number };

const httpBuckets = new Map<string, Bucket>();
const pollBuckets = new Map<string, Bucket>();
const activePollers = new Map<string, { baseMs?: number; registeredAt: number }>();
const realtimeChannels = new Map<string, { registeredAt: number }>();

let mountedPages: string[] = [];
let pruneTimer: ReturnType<typeof setInterval> | null = null;
let channelPatched = false;

function now() {
  return Date.now();
}

function bump(map: Map<string, Bucket>, key: string) {
  const t = now();
  const prev = map.get(key);
  if (!prev || t - prev.lastAt > WINDOW_MS) {
    map.set(key, { count: 1, lastAt: t });
  } else {
    prev.count += 1;
    prev.lastAt = t;
  }
}

function pruneMap(map: Map<string, Bucket>) {
  const cutoff = now() - WINDOW_MS;
  for (const [k, v] of map) {
    if (v.lastAt < cutoff) map.delete(k);
  }
}

function ensurePruneLoop() {
  if (pruneTimer != null || typeof window === 'undefined') return;
  pruneTimer = window.setInterval(() => {
    pruneMap(httpBuckets);
    pruneMap(pollBuckets);
  }, PRUNE_EVERY_MS);
}

export function bucketHttpRequest(href: string, method: string): string {
  try {
    const u = new URL(href, typeof window !== 'undefined' ? window.location.origin : 'https://local');
    const path = u.pathname;
    const m = (method || 'GET').toUpperCase();
    if (path.includes('/rest/v1/')) {
      const table = path.split('/rest/v1/')[1]?.split('?')[0]?.trim() || 'rest';
      return `${m} ${table}`;
    }
    if (path.includes('/functions/v1/')) {
      const fn = path.split('/functions/v1/')[1]?.split('/')[0] || 'edge';
      return `EDGE ${fn}`;
    }
    if (path.includes('/auth/v1/')) return 'auth';
    if (path.includes('/realtime/')) return 'realtime';
  } catch {
    /* ignore */
  }
  return `${method} http`;
}

export function recordHttpRequest(href: string, method: string): void {
  ensurePruneLoop();
  bump(httpBuckets, bucketHttpRequest(href, method));
}

export function registerPoller(label: string, baseMs?: number): void {
  ensurePruneLoop();
  activePollers.set(label, { baseMs, registeredAt: now() });
}

export function unregisterPoller(label: string): void {
  activePollers.delete(label);
}

export function recordPollerTick(label: string): void {
  ensurePruneLoop();
  bump(pollBuckets, label);
}

export function registerRealtimeChannel(name: string): void {
  realtimeChannels.set(name, { registeredAt: now() });
}

export function unregisterRealtimeChannel(name: string): void {
  realtimeChannels.delete(name);
}

export function setDiagnosticsMountedPages(pages: string[]): void {
  mountedPages = [...pages];
}

export type DiagnosticsSnapshot = {
  generatedAt: string;
  windowMinutes: number;
  activePage: string;
  mountedPages: string[];
  http: Array<{ key: string; count: number }>;
  polls: Array<{ key: string; count: number }>;
  activePollers: Array<{ label: string; baseMs?: number }>;
  realtimeChannels: string[];
  memory?: {
    usedMb?: number;
    totalMb?: number;
    jsHeapUsedMb?: number;
    jsHeapLimitMb?: number;
  };
  electron?: Record<string, unknown>;
};

export function getDiagnosticsSnapshot(electronExtra?: Record<string, unknown>): DiagnosticsSnapshot {
  pruneMap(httpBuckets);
  pruneMap(pollBuckets);

  const mem = (performance as Performance & { memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number } })
    .memory;

  const http = [...httpBuckets.entries()]
    .map(([key, v]) => ({ key, count: v.count }))
    .sort((a, b) => b.count - a.count);

  const polls = [...pollBuckets.entries()]
    .map(([key, v]) => ({ key, count: v.count }))
    .sort((a, b) => b.count - a.count);

  return {
    generatedAt: new Date().toISOString(),
    windowMinutes: WINDOW_MS / 60_000,
    activePage: getActivePosPage(),
    mountedPages: [...mountedPages],
    http,
    polls,
    activePollers: [...activePollers.entries()].map(([label, meta]) => ({
      label,
      baseMs: meta.baseMs,
    })),
    realtimeChannels: [...realtimeChannels.keys()].sort(),
    memory: mem
      ? {
          jsHeapUsedMb: Math.round(mem.usedJSHeapSize / 1024 / 1024),
          jsHeapLimitMb: Math.round(mem.jsHeapSizeLimit / 1024 / 1024),
          totalMb: Math.round(mem.totalJSHeapSize / 1024 / 1024),
        }
      : undefined,
    electron: electronExtra,
  };
}

export type DiagnosticInsight = {
  severity: 'info' | 'warn' | 'critical';
  title: string;
  detail: string;
  source?: string;
};

/** Kural tabanlı “akıllı” özet — ML yok, destek için okunabilir Türkçe. */
export function analyzeDiagnostics(snapshot: DiagnosticsSnapshot): DiagnosticInsight[] {
  const out: DiagnosticInsight[] = [];
  const ch = snapshot.realtimeChannels;
  const http = snapshot.http;
  const polls = snapshot.polls;

  const countHttp = (substr: string) =>
    http.filter((h) => h.key.toLowerCase().includes(substr.toLowerCase())).reduce((s, h) => s + h.count, 0);

  if (ch.length >= 10) {
    out.push({
      severity: 'critical',
      title: 'Çok fazla canlı bağlantı (Realtime)',
      detail: `${ch.length} kanal açık (${ch.slice(0, 6).join(', ')}${ch.length > 6 ? '…' : ''}). Gün içinde açılan ürün/cari/sadakat/masa ekranları arka planda kalıyorsa kasa yavaşlar. Uygulamayı bir kez tamamen kapatıp açın veya güncel sürümü kullanın.`,
      source: 'realtime',
    });
  } else if (ch.length >= 6) {
    out.push({
      severity: 'warn',
      title: 'Birden fazla Realtime kanalı',
      detail: `${ch.length} kanal: ${ch.join(', ')}. Normalde aktif ekran + masa/paket + bildirim için 3–5 yeterlidir.`,
      source: 'realtime',
    });
  }

  const printJobs = countHttp('print_jobs');
  if (printJobs >= 8) {
    out.push({
      severity: 'warn',
      title: 'Yazıcı kuyruğu sık sorgulanıyor',
      detail: `Son ${snapshot.windowMinutes} dk içinde print_jobs için ~${printJobs} istek. Fiş çoğu zaman doğrudan basılır; bu sayı yüksekse Print Agent yedek poll veya kopmuş Realtime olabilir (Electron tanılama kutusuna bakın).`,
      source: 'print_jobs',
    });
  }

  const getirLike =
    countHttp('online_orders') +
    countHttp('getir') +
    polls.filter((p) => /getir/i.test(p.key)).reduce((s, p) => s + p.count, 0);
  if (getirLike >= 25) {
    out.push({
      severity: 'warn',
      title: 'Online / Getir senkronu yoğun',
      detail: `Platform siparişleri için sık istek görülüyor. Online/masa ekranında normal; ana ekranda seyrek, paket/stok/ayarlarda Getir poll kapalı olmalı.`,
      source: 'getir',
    });
  }

  const tables = ch.filter((n) => n.includes('tables') || n.includes('order-panel'));
  const takeaway = ch.filter((n) => n.includes('takeaway'));
  if (tables.length > 0 && takeaway.length > 0 && snapshot.activePage !== 'tables' && snapshot.activePage !== 'takeaway') {
    out.push({
      severity: 'warn',
      title: 'Masa ve paket kanalları aynı anda açık',
      detail: `Aktif sayfa “${snapshot.activePage}” iken hem masa hem paket dinleniyor. Gün içi gezinmeden birikmiş olabilir.`,
      source: 'tables+takeaway',
    });
  }

  if (snapshot.mountedPages.length >= 8) {
    out.push({
      severity: 'warn',
      title: 'Çok sayıda ekran bellekte tutuluyor',
      detail: `${snapshot.mountedPages.length} sayfa daha önce açılmış (${snapshot.mountedPages.join(', ')}). Her biri kanal veya veri tutabilir — öğleden sonra yavaşlama bununla uyumlu.`,
      source: 'mounted',
    });
  }

  const waiter = ch.find((n) => n.includes('waiter-calls'));
  if (waiter && !['tables', 'waiter-app', 'desktop-home'].includes(snapshot.activePage)) {
    out.push({
      severity: 'info',
      title: 'Garson çağrısı paket dışı ekranda dinleniyor',
      detail: 'Güncel sürümde bu kanal yalnızca masa/ana sayfada açılmalı. Eski sürüm veya uzun oturumda kapanmamış olabilir.',
      source: 'waiter-calls',
    });
  }

  const mem = snapshot.memory?.jsHeapUsedMb;
  const lim = snapshot.memory?.jsHeapLimitMb;
  if (mem != null && lim != null && mem > lim * 0.75) {
    out.push({
      severity: 'critical',
      title: 'Tarayıcı belleği dolmak üzere',
      detail: `JS heap ~${mem} MB / ${lim} MB. Opera veya başka ağır programlarla birlikte kasa donabilir. ŞefPOS’u yeniden başlatın, gereksiz sekmeleri kapatın.`,
      source: 'memory',
    });
  }

  const electron = snapshot.electron as {
    printAgent?: { realtimeConnected?: boolean; pendingPollActive?: boolean; pollMs?: number };
  } | undefined;
  if (electron?.printAgent?.pendingPollActive && !electron.printAgent.realtimeConnected) {
    out.push({
      severity: 'info',
      title: 'Yazıcı: Realtime kapalı, yedek poll aktif',
      detail: `Kuyruk ~${(electron.printAgent.pollMs || 15000) / 1000} sn aralıkla kontrol ediliyor. İnternet veya firewall Realtime’ı kesiyorsa fiş gecikmeli basılır; ağ stabil olunca yük azalır.`,
      source: 'print-agent',
    });
  }

  if (out.length === 0) {
    out.push({
      severity: 'info',
      title: 'Belirgin anomali yok (son pencere)',
      detail: `Açık kanal: ${ch.length}, HTTP kayıt: ${http.length} tür. Yavaşlama sürüyorsa raporu dışa aktarıp desteğe gönderin; Windows Görev Yöneticisi’nde RAM ve diğer uygulamalara da bakın.`,
    });
  }

  return out;
}

export function exportDiagnosticsJson(snapshot: DiagnosticsSnapshot, insights: DiagnosticInsight[]): string {
  return JSON.stringify({ snapshot, insights }, null, 2);
}

const channelInstanceNames = new WeakMap<RealtimeChannel, string>();

/** Supabase Realtime kanallarını otomatik say. */
export function installSupabaseDiagnostics(client: SupabaseClient): void {
  if (channelPatched) return;
  channelPatched = true;

  const origChannel = client.channel.bind(client);
  (client as SupabaseClient).channel = function channel(name: string, opts?: Parameters<SupabaseClient['channel']>[1]) {
    const ch = origChannel(name, opts);
    channelInstanceNames.set(ch, name);
    registerRealtimeChannel(name);
    return ch;
  };

  const origRemove = client.removeChannel.bind(client);
  client.removeChannel = function removeChannel(channel: RealtimeChannel) {
    const name = channelInstanceNames.get(channel);
    if (name) unregisterRealtimeChannel(name);
    return origRemove(channel);
  };
}
