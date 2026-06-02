import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Brain,
  Copy,
  Download,
  Info,
  RefreshCw,
} from 'lucide-react';
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
    </div>
  );
}
