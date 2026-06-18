import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Download,
  Loader2,
  Shield,
  Headphones,
} from 'lucide-react';
import { publicAsset } from '../../lib/assetUrl';
import { ElectronConnectionMenu, type ElectronConnectMode } from './ElectronConnectionMenu';
import { SqlServerSettings } from '../SqlServerSettings';
import { ConnectionModeBadge } from './ConnectionModeBadge';
import { getConnectionModeDisplay } from '../../lib/connectionMode';

import { markSqlSetupComplete, activateElectronCloudMode } from '../../lib/hybridMode';
import { HybridCloudLink } from './HybridCloudLink';

export interface SqlServerDetectResult {
  ok: boolean;
  platform: string;
  hasSqlServer: boolean;
  instances: Array<{
    instanceName: string;
    serviceRunning: boolean;
    tcpPort: number | null;
  }>;
  recommendedHost: string;
  downloadUrl: string;
  sqlExpressInstalled: boolean;
  sqlExpressRunning: boolean;
}

type WizardStep = 'mode' | 'sql-check' | 'sql-setup' | 'cloud-link' | 'ready';

type Props = {
  initialMode?: 'cloud' | 'sqlserver' | 'hybrid' | 'local' | null;
  needsSqlSetup?: boolean;
  onComplete: (mode: 'cloud' | 'sqlserver' | 'hybrid' | 'local') => void;
  onBackToLogin?: () => void;
};

function resolveInitialStep(initialMode: Props['initialMode'], needsSqlSetup?: boolean): WizardStep {
  if ((initialMode === 'sqlserver' || initialMode === 'hybrid') && needsSqlSetup) return 'sql-check';
  if (initialMode === 'cloud' || initialMode === 'local') return 'ready';
  return 'mode';
}

export function ElectronSetupWizard({
  initialMode = null,
  needsSqlSetup = false,
  onComplete,
  onBackToLogin,
}: Props) {
  const [step, setStep] = useState<WizardStep>(() => resolveInitialStep(initialMode, needsSqlSetup));
  const [selectedMode, setSelectedMode] = useState<ElectronConnectMode | null>(
    initialMode === 'sqlserver'
      ? 'sqlserver'
      : initialMode === 'hybrid'
        ? 'hybrid'
        : initialMode === 'cloud'
        ? 'cloud'
        : initialMode === 'local'
          ? 'local'
          : null,
  );
  const [detectResult, setDetectResult] = useState<SqlServerDetectResult | null>(null);
  const [detectLoading, setDetectLoading] = useState(false);
  const [detectError, setDetectError] = useState('');
  const [suggestedHost, setSuggestedHost] = useState('.\\SQLEXPRESS');

  const runDetect = useCallback(async () => {
    const api = (window as any).electronAPI;
    setDetectLoading(true);
    setDetectError('');
    try {
      const result = (await api?.detectSqlServer?.()) as SqlServerDetectResult | undefined;
      if (!result) {
        setDetectError('SQL Server taraması yapılamadı.');
        setDetectResult(null);
        return;
      }
      setDetectResult(result);
      if (result.recommendedHost) setSuggestedHost(result.recommendedHost);
    } catch (e: any) {
      setDetectError(e?.message || 'Tarama hatası');
    } finally {
      setDetectLoading(false);
    }
  }, []);

  useEffect(() => {
    if (step === 'sql-check') void runDetect();
  }, [step, runDetect]);

  const handleModeSelect = async (mode: ElectronConnectMode) => {
    if (mode === 'terminal') {
      localStorage.setItem('shefpos_pending_terminal', 'true');
      window.location.reload();
      return;
    }

    const api = (window as any).electronAPI;
    await api?.setDbMode?.(mode);
    setSelectedMode(mode);

    if (mode === 'sqlserver' || mode === 'postgres' || mode === 'hybrid') {
      localStorage.setItem('dbMode', mode === 'hybrid' ? 'hybrid' : 'sqlserver');
      await api?.setDbMode?.(mode === 'hybrid' ? 'hybrid' : 'sqlserver');
      setStep('sql-check');
      return;
    }
    if (mode === 'local') {
      localStorage.setItem('dbMode', 'local');
      setStep('ready');
      return;
    }
    await activateElectronCloudMode();
    setStep('ready');
  };

  const handleSqlSetupDone = () => {
    markSqlSetupComplete();
    const mode = selectedMode === 'hybrid' ? 'hybrid' : 'sqlserver';
    localStorage.setItem('dbMode', mode);
    if (selectedMode === 'hybrid') {
      setStep('cloud-link');
      return;
    }
    onComplete('sqlserver');
  };

  const handleCloudLinkDone = () => {
    markSqlSetupComplete();
    onComplete('hybrid');
  };

  const handleReadyContinue = () => {
    if (selectedMode === 'local') onComplete('local');
    else onComplete('cloud');
  };

  const readyDisplay = useMemo(() => {
    if (selectedMode === 'local') return getConnectionModeDisplay('local');
    if (selectedMode === 'hybrid') return getConnectionModeDisplay('hybrid');
    if (selectedMode === 'sqlserver') return getConnectionModeDisplay('sqlserver');
    return getConnectionModeDisplay('cloud');
  }, [selectedMode]);

  const stepLabels: Record<WizardStep, string> = {
    mode: 'Mod seçimi',
    'sql-check': 'SQL Server kontrolü',
    'sql-setup': 'Veritabanı kurulumu',
    'cloud-link': 'Bulut bağlantısı',
    ready: 'Hazır',
  };

  const stepOrder: WizardStep[] =
    selectedMode === 'hybrid'
      ? ['mode', 'sql-check', 'sql-setup', 'cloud-link', 'ready']
      : selectedMode === 'sqlserver'
        ? ['mode', 'sql-check', 'sql-setup', 'ready']
        : ['mode', 'ready'];
  const stepIndex = Math.max(0, stepOrder.indexOf(step));

  if (step === 'mode') {
    return <ElectronConnectionMenu onSelect={handleModeSelect} variant="setup" onBack={onBackToLogin} />;
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <img
            src={publicAsset('sefpos-round.png')}
            alt="ŞefPOS"
            className="h-11 w-11 rounded-full object-cover ring-2 ring-orange-100"
            onError={(e) => {
              (e.target as HTMLImageElement).src = publicAsset('logo.png');
            }}
          />
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-orange-600">ŞefPOS</p>
            <h1 className="text-lg font-bold text-slate-900 leading-tight">Kurulum sihirbazı</h1>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-4 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1">
            <Shield className="w-3.5 h-3.5 text-slate-400" />
            Tek seferde kurulum
          </span>
          <span className="inline-flex items-center gap-1">
            <Headphones className="w-3.5 h-3.5 text-slate-400" />
            0544 244 90 80
          </span>
        </div>
      </header>

      <div className="bg-white border-b border-slate-100 px-6 py-3">
        <div className="max-w-3xl mx-auto flex flex-wrap items-center gap-2 text-xs">
          {stepOrder.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              {i > 0 && <ChevronRight className="w-3.5 h-3.5 text-slate-300" />}
              <span
                className={`font-semibold px-2 py-1 rounded-full ${
                  s === step
                    ? 'bg-orange-100 text-orange-800'
                    : i < stepIndex
                      ? 'text-emerald-700'
                      : 'text-slate-400'
                }`}
              >
                {i + 1}. {stepLabels[s]}
              </span>
            </div>
          ))}
        </div>
      </div>

      <main className="flex-1 flex items-start justify-center p-6 md:p-10 overflow-y-auto">
        <div className="w-full max-w-3xl">
          {step === 'sql-check' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 md:p-8">
              <button
                type="button"
                onClick={() => setStep('mode')}
                className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-orange-600 mb-6"
              >
                <ArrowLeft className="w-4 h-4" />
                Mod seçimine dön
              </button>

              <div className="flex items-center gap-3 mb-2">
                <ConnectionModeBadge mode="sqlserver" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900 mb-2">SQL Server kontrolü</h2>
              <p className="text-slate-600 text-sm mb-6">
                Bilgisayarınızda SQL Server kurulu mu diye bakıyoruz. Yoksa indirme bağlantısı
                vereceğiz; uzak sunucu kullanıyorsanız yine de devam edebilirsiniz.
              </p>

              {detectLoading && (
                <div className="flex items-center gap-3 p-4 rounded-xl bg-slate-50 border border-slate-200 text-slate-600">
                  <Loader2 className="w-5 h-5 animate-spin text-orange-500" />
                  SQL Server örnekleri taranıyor…
                </div>
              )}

              {!detectLoading && detectError && (
                <div className="flex items-start gap-3 p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 mb-4">
                  <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">Tarama tamamlanamadı</p>
                    <p className="text-sm mt-1">{detectError}</p>
                  </div>
                </div>
              )}

              {!detectLoading && detectResult && (
                <div className="space-y-4">
                  {detectResult.hasSqlServer ? (
                    <div className="flex items-start gap-3 p-4 rounded-xl bg-emerald-50 border border-emerald-200">
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold text-emerald-900">SQL Server bulundu</p>
                        <ul className="mt-2 space-y-1 text-sm text-emerald-800">
                          {detectResult.instances.map((inst) => (
                            <li key={inst.instanceName} className="flex flex-wrap items-center gap-2">
                              <span className="font-mono">{inst.instanceName}</span>
                              <span className={inst.serviceRunning ? 'text-emerald-700' : 'text-amber-700'}>
                                {inst.serviceRunning ? '· çalışıyor' : '· servis kapalı'}
                              </span>
                              {inst.tcpPort ? (
                                <span className="text-emerald-600">· port {inst.tcpPort}</span>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                        <p className="text-sm mt-2 text-emerald-800">
                          Önerilen bağlantı: <strong className="font-mono">{detectResult.recommendedHost}</strong>
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200">
                      <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold text-amber-900">SQL Server bulunamadı</p>
                        <p className="text-sm text-amber-800 mt-1">
                          Şube sunucusu modu için SQL Server Express kurmanız gerekir. Kurulumda
                          <strong> Karışık mod (Mixed Mode)</strong> ve <strong>sa</strong> parolası seçin.
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            void (window as any).electronAPI?.openExternalUrl?.(detectResult.downloadUrl);
                          }}
                          className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold"
                        >
                          <Download className="w-4 h-4" />
                          SQL Server Express İndir
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="mt-8 flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  onClick={() => void runDetect()}
                  disabled={detectLoading}
                  className="px-4 py-3 rounded-xl border border-slate-300 text-slate-700 font-semibold text-sm hover:bg-slate-50 disabled:opacity-50"
                >
                  Yeniden tara
                </button>
                <button
                  type="button"
                  onClick={() => setStep('sql-setup')}
                  className="flex-1 px-4 py-3 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-sm"
                >
                  {detectResult?.hasSqlServer ? 'Veritabanını kur →' : 'Yine de devam et →'}
                </button>
              </div>
            </div>
          )}

          {step === 'sql-setup' && (
            <div>
              <button
                type="button"
                onClick={() => setStep('sql-check')}
                className="inline-flex items-center gap-1 text-sm font-semibold text-slate-600 hover:text-orange-600 mb-4"
              >
                <ArrowLeft className="w-4 h-4" />
                SQL kontrolüne dön
              </button>
              <SqlServerSettings
                inline
                showBack={false}
                suggestedHost={suggestedHost}
                onSave={handleSqlSetupDone}
                onClose={handleSqlSetupDone}
              />
            </div>
          )}

          {step === 'cloud-link' && (
            <HybridCloudLink
              onLinked={handleCloudLinkDone}
              onSkip={() => {
                markSqlSetupComplete();
                onComplete('hybrid');
              }}
            />
          )}

          {step === 'ready' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center">
              <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8 text-emerald-600" />
              </div>
              <div className="flex justify-center mb-4">
                <ConnectionModeBadge mode={readyDisplay.key} />
              </div>
              <h2 className="text-2xl font-bold text-slate-900 mb-2">{readyDisplay.label} hazır</h2>
              <p className="text-slate-600 text-sm max-w-md mx-auto mb-8">{readyDisplay.description}</p>
              <p className="text-xs text-slate-500 mb-6">
                Seçilen mod üst barda görünür. Lisans bitiş tarihi giriş yaptıktan sonra Ayka paneliyle
                aynı şekilde gösterilir.
              </p>
              <button
                type="button"
                onClick={handleReadyContinue}
                className="px-8 py-3 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold"
              >
                Giriş ekranına git
              </button>
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => setStep('mode')}
                  className="text-sm text-slate-500 hover:text-orange-600 font-semibold"
                >
                  Modu değiştir
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      <footer className="shrink-0 py-4 text-center text-xs text-slate-400 border-t border-slate-200 bg-white">
        © {new Date().getFullYear()} ŞefPOS · www.sefpos.com.tr
      </footer>
    </div>
  );
}
