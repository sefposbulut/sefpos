import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Brain,
  Copy,
  Download,
  Info,
  Play,
  RefreshCw,
  Square,
} from 'lucide-react';
import {
  exportStressTestJson,
  getStressPlatformLabel,
  getStressTestPages,
  isPosLoadSimulationRunning,
  loadLastStressTestReport,
  runPosLoadSimulation,
  stopPosLoadSimulation,
  type StressTestReport,
} from '../lib/posLoadSimulator';
import {
  analyzeDiagnostics,
  exportDiagnosticsJson,
  getDiagnosticsSnapshot,
  type DiagnosticInsight,
  type DiagnosticsSnapshot,
} from '../lib/resourceDiagnostics';

type ElectronDiag = {
  printAgent?: {
    pollMs?: number;
    realtimeConnected?: boolean;
    pendingPollActive?: boolean;
    hasTenant?: boolean;
    hasJwt?: boolean;
  };
  processMemoryMb?: { rss?: number; heapUsed?: number };
};

export function SystemDiagnosticsPanel() {
  const [snapshot, setSnapshot] = useState<DiagnosticsSnapshot | null>(null);
  const [insights, setInsights] = useState<DiagnosticInsight[]>([]);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [stressRunning, setStressRunning] = useState(false);
  const [stressProgress, setStressProgress] = useState<string | null>(null);
  const [stressReport, setStressReport] = useState<StressTestReport | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    let electronExtra: Record<string, unknown> | undefined;
    const api = (window as { electronAPI?: { getSystemDiagnostics?: () => Promise<ElectronDiag> } })
      .electronAPI;
    if (api?.getSystemDiagnostics) {
      try {
        electronExtra = { printAgent: await api.getSystemDiagnostics() };
      } catch {
        electronExtra = { printAgent: { error: 'okunamadi' } };
      }
    }
    const snap = getDiagnosticsSnapshot(electronExtra);
    setSnapshot(snap);
    setInsights(analyzeDiagnostics(snap));
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
    const prev = loadLastStressTestReport();
    if (prev) setStressReport(prev);
    const id = window.setInterval(() => void refresh(), 4000);
    return () => window.clearInterval(id);
  }, [refresh]);

  const handleExport = () => {
    if (!snapshot) return;
    const json = exportDiagnosticsJson(snapshot, insights);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sefpos-tani-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopy = async () => {
    if (!snapshot) return;
    const json = exportDiagnosticsJson(snapshot, insights);
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  const severityIcon = (s: DiagnosticInsight['severity']) => {
    if (s === 'critical') return <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />;
    if (s === 'warn') return <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />;
    return <Info className="w-4 h-4 text-sky-600 shrink-0" />;
  };

  const pa = snapshot?.electron?.printAgent as ElectronDiag['printAgent'] | undefined;

  const startStressTest = async () => {
    if (
      !window.confirm(
        'Kasa yük simülasyonu: masa, paket, online, ürünler vb. sırayla açılır (~90 sn). ' +
          'Canlı işlem yapmayın; test bitince başladığınız sayfaya döner. Devam?',
      )
    ) {
      return;
    }
    setStressReport(null);
    setStressRunning(true);
    setStressProgress('Başlıyor…');
    try {
      const report = await runPosLoadSimulation({
        durationMs: 90_000,
        stepMs: 10_000,
        premountAll: true,
        onProgress: ({ page, elapsedMs, channels }) => {
          setStressProgress(`${Math.round(elapsedMs / 1000)} sn · ${page} · ${channels} kanal`);
        },
      });
      setStressReport(report);
      void refresh();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      window.alert(msg);
    } finally {
      setStressRunning(false);
      setStressProgress(null);
    }
  };

  const exportStress = () => {
    if (!stressReport) return;
    const json = exportStressTestJson(stressReport);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sefpos-yuk-testi-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-white border-2 border-violet-200 rounded-xl p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Brain className="w-5 h-5 text-violet-600" />
          <div>
            <h4 className="font-bold text-gray-800">Kasa yük analizi</h4>
            <p className="text-xs text-gray-500 mt-0.5">
              Son {snapshot?.windowMinutes ?? 5} dk istek ve kanallar — kural tabanlı öneriler (destek için dışa aktarın).
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-sm hover:bg-gray-50 disabled:opacity-60"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Yenile
          </button>
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-sm hover:bg-gray-50"
          >
            <Copy className="w-3.5 h-3.5" />
            {copied ? 'Kopyalandı' : 'Kopyala'}
          </button>
          <button
            type="button"
            onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700"
          >
            <Download className="w-3.5 h-3.5" />
            JSON indir
          </button>
        </div>
      </div>

      {snapshot && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div className="bg-gray-50 rounded-lg p-2">
            <div className="text-gray-500">Aktif ekran</div>
            <div className="font-bold text-gray-800 truncate">{snapshot.activePage}</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-2">
            <div className="text-gray-500">Realtime kanal</div>
            <div className="font-bold text-gray-800">{snapshot.realtimeChannels.length}</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-2">
            <div className="text-gray-500">Bellek (JS)</div>
            <div className="font-bold text-gray-800">
              {snapshot.memory?.jsHeapUsedMb != null
                ? `${snapshot.memory.jsHeapUsedMb} MB`
                : '—'}
            </div>
          </div>
          <div className="bg-gray-50 rounded-lg p-2">
            <div className="text-gray-500">Açılmış sayfa</div>
            <div className="font-bold text-gray-800">{snapshot.mountedPages.length}</div>
          </div>
        </div>
      )}

      {pa && (
        <div className="text-xs bg-slate-50 border border-slate-200 rounded-lg p-3 text-slate-700">
          <span className="font-semibold">Yazıcı agent: </span>
          Realtime {pa.realtimeConnected ? 'bağlı' : 'kapalı'}
          {pa.pollMs ? ` · yedek poll ${pa.pollMs / 1000}s` : ''}
          {pa.pendingPollActive ? ' · poll aktif' : ''}
        </div>
      )}

      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-bold text-gray-700">
          <Activity className="w-4 h-4 text-violet-500" />
          Öneriler
        </div>
        <ul className="space-y-2">
          {insights.map((item, i) => (
            <li
              key={`${item.source}-${i}`}
              className={`flex gap-2 p-3 rounded-lg text-sm border ${
                item.severity === 'critical'
                  ? 'bg-rose-50 border-rose-200'
                  : item.severity === 'warn'
                    ? 'bg-amber-50 border-amber-200'
                    : 'bg-sky-50 border-sky-100'
              }`}
            >
              {severityIcon(item.severity)}
              <div>
                <div className="font-semibold text-gray-800">{item.title}</div>
                <div className="text-gray-600 text-xs mt-0.5 leading-relaxed">{item.detail}</div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {snapshot && snapshot.realtimeChannels.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer font-semibold text-gray-600">Açık Realtime kanalları</summary>
          <ul className="mt-2 space-y-0.5 text-gray-500 font-mono">
            {snapshot.realtimeChannels.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </details>
      )}

      {snapshot && snapshot.http.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer font-semibold text-gray-600">En sık HTTP (son pencere)</summary>
          <table className="mt-2 w-full text-left">
            <tbody>
              {snapshot.http.slice(0, 12).map((row) => (
                <tr key={row.key} className="border-t border-gray-100">
                  <td className="py-1 pr-2 font-mono text-gray-600">{row.key}</td>
                  <td className="py-1 text-right font-bold">{row.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}

      {snapshot && snapshot.polls.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer font-semibold text-gray-600">Periyodik görevler (poll)</summary>
          <table className="mt-2 w-full text-left">
            <tbody>
              {snapshot.polls.map((row) => (
                <tr key={row.key} className="border-t border-gray-100">
                  <td className="py-1 pr-2 font-mono text-gray-600">{row.key}</td>
                  <td className="py-1 text-right font-bold">{row.count} tur</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}

      <div className="border-t border-violet-100 pt-4 space-y-3">
        <div>
          <h5 className="text-sm font-bold text-gray-800">
            Kasa yük simülasyonu (bot)
            <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded">
              {getStressPlatformLabel()}
            </span>
          </h5>
          <p className="text-xs text-gray-500 mt-1 leading-relaxed">
            Electron, web tarayıcı ve Cloudflare Pages’te aynı test. Gerçek ekran geçişleri:{' '}
            {getStressTestPages().join(', ')}. Hub sayfaları bir kez belleğe alınır; sonra döngüyle açılır.
            Veri yazmaz; kanal ve HTTP yükünü ölçer.
          </p>
        </div>
        {stressProgress && (
          <p className="text-xs font-mono text-violet-700 bg-violet-50 rounded-lg px-3 py-2">{stressProgress}</p>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={stressRunning || isPosLoadSimulationRunning()}
            onClick={() => void startStressTest()}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-500 text-white text-sm font-bold hover:bg-amber-600 disabled:opacity-50"
          >
            <Play className="w-4 h-4" />
            90 sn test başlat
          </button>
          {stressRunning && (
            <button
              type="button"
              onClick={() => {
                stopPosLoadSimulation();
                setStressRunning(false);
                setStressProgress('Durduruldu');
              }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-rose-300 text-rose-700 text-sm font-semibold"
            >
              <Square className="w-3.5 h-3.5" />
              Durdur
            </button>
          )}
          {stressReport && (
            <button
              type="button"
              onClick={exportStress}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-sm hover:bg-gray-50"
            >
              <Download className="w-3.5 h-3.5" />
              Test raporu indir
            </button>
          )}
        </div>
        {stressReport && (
          <div className="text-xs bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-1">
            <div>
              <span className="font-semibold">En fazla Realtime kanal:</span>{' '}
              {stressReport.summary.maxRealtimeChannels}
              {stressReport.summary.maxRealtimeChannels >= 8 ? ' — yüksek, optimizasyon gerekir' : ' — makul'}
            </div>
            <div>
              <span className="font-semibold">Açılmış sayfa:</span> {stressReport.summary.maxMountedPages}
            </div>
            <div>
              <span className="font-semibold">JS bellek (max):</span> {stressReport.summary.maxJsHeapMb} MB
            </div>
            <div>
              <span className="font-semibold">Uyarı / kritik (adım toplamı):</span>{' '}
              {stressReport.summary.warnCount} / {stressReport.summary.criticalCount}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
