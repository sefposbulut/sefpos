import { useCallback, useEffect, useState } from 'react';
import { Copy, Send, AlertCircle, CheckCircle2, ChevronDown, FlaskConical } from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  maskToken,
  sendHemenYoldaTestSample,
  HEMENYOLDA_CERT_MAIL_ORDER_IDS,
  type HemenYoldaIntegrationRow,
  type HemenyoldaTestSample,
} from '../lib/hemenyoldaApi';

interface Branch {
  id: string;
  name: string;
}

interface Props {
  tenantId: string;
  branches: Branch[];
  activeBranchId: string | null;
  embedded?: boolean;
  onConfiguredChange?: (active: boolean) => void;
}

const TEST_BUTTONS: { sample: HemenyoldaTestSample; label: string }[] = [
  { sample: 'getir', label: 'Getir örneği' },
  { sample: 'yemeksepeti', label: 'YemekSepeti örneği' },
  { sample: 'trendyol', label: 'Trendyol örneği' },
  { sample: 'telefon', label: 'Telefon siparişi' },
  { sample: 'update', label: 'Sipariş güncelleme' },
  { sample: 'cancel', label: 'Sipariş iptal' },
];

export default function HemenYoldaIntegrationSettings({
  tenantId,
  branches,
  activeBranchId,
  embedded = false,
  onConfiguredChange,
}: Props) {
  const [row, setRow] = useState<HemenYoldaIntegrationRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [appName, setAppName] = useState('test-pos');
  const [accessToken, setAccessToken] = useState('');
  const [baseUrl, setBaseUrl] = useState('https://hemenyolda.com');
  const [branchId, setBranchId] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [isTestMode, setIsTestMode] = useState(true);
  const [copied, setCopied] = useState(false);
  const [showCertTests, setShowCertTests] = useState(!embedded);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('henemyolda_integrations')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const r = data as HemenyoldaIntegrationRow | null;
    setRow(r);
    if (r) {
      setAppName(r.app_name);
      setAccessToken(r.access_token);
      setBaseUrl(r.base_url || 'https://hemenyolda.com');
      setBranchId(r.branch_id || '');
      setIsActive(r.is_active);
      setIsTestMode(r.is_test_mode);
    } else {
      setBranchId(activeBranchId || '');
    }
    onConfiguredChange?.(!!r && !!r.is_active && !!String(r?.access_token || '').trim());
    setLoading(false);
  }, [tenantId, activeBranchId, onConfiguredChange]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!appName.trim()) {
      alert('APP_NAME zorunludur');
      return;
    }
    if (!accessToken.trim()) {
      alert('Access token zorunludur');
      return;
    }
    setSaving(true);
    const payload = {
      tenant_id: tenantId,
      branch_id: branchId || null,
      app_name: appName.trim(),
      access_token: accessToken.trim(),
      base_url: baseUrl.trim() || 'https://hemenyolda.com',
      is_active: isActive,
      is_test_mode: isTestMode,
      updated_at: new Date().toISOString(),
    };
    let error;
    if (row?.id) {
      ({ error } = await supabase.from('henemyolda_integrations').update(payload).eq('id', row.id));
    } else {
      ({ error } = await supabase.from('henemyolda_integrations').insert(payload));
    }
    setSaving(false);
    if (error) {
      alert('Kayıt hatası: ' + error.message);
      return;
    }
    await load();
    setTestResult('Ayarlar kaydedildi.');
  };

  const runTest = async (sample: HemenyoldaTestSample) => {
    if (!accessToken.trim()) {
      alert('Önce Access Token girin ve Kaydet\'e basın.');
      return;
    }
    if (!row?.id) {
      alert('Ayarları kaydetmeden test gönderilemez. Kaydet\'e basın.');
      return;
    }
    setTesting(sample);
    setTestResult(null);
    const res = await sendHemenYoldaTestSample(sample);
    setTesting(null);
    if (res.ok || res.status === 204) {
      const note = res.note || res.hint ? ` — ${res.note || res.hint}` : '';
      setTestResult(`${sample}: başarılı (HTTP ${res.status ?? 204}) — sipariş id: ${res.order_id ?? '—'}${note}`);
    } else {
      const detail = res.hint || res.error || res.message || JSON.stringify(res);
      setTestResult(`${sample}: hata — ${detail}`);
    }
  };

  const copyEndpoints = async () => {
    const base = baseUrl.replace(/\/+$/, '');
    const name = appName.trim() || '[APP_NAME]';
    const text = [
      `POST ${base}/api/integration/${name}/new-order`,
      `POST ${base}/api/integration/${name}/updated-order`,
      `POST ${base}/api/integration/${name}/canceled-order`,
    ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      prompt('Endpointler:', text);
    }
  };

  if (loading) {
    return <p className="text-sm text-slate-500">HemenYolda ayarları yükleniyor…</p>;
  }

  return (
    <div className="space-y-4">
      {!embedded && (
        <div className="bg-gradient-to-r from-emerald-600 to-teal-700 rounded-xl p-4 md:p-5 text-white">
          <h3 className="text-lg font-bold mb-2">HemenYolda</h3>
          <p className="text-emerald-50 text-sm">Paket siparişleri otomatik webhook ile gider.</p>
        </div>
      )}
      {embedded && (
        <p className="text-sm text-slate-600">
          <strong>APP_NAME</strong> ve <strong>Access Token</strong> girin, <strong>Entegrasyon aktif</strong> ile kaydedin.
        </p>
      )}

      <div className={embedded ? 'space-y-4' : 'bg-white rounded-xl border border-slate-200 p-4 space-y-4'}>
        <h4 className="font-bold text-slate-800">Bağlantı bilgileri</h4>
        <p className="text-xs text-slate-500">
          HemenYolda’dan gelen <strong>APP_NAME</strong> ve <strong>Access Token</strong> değerlerini girin. Test:{' '}
          <code className="bg-slate-100 px-1 rounded">test-pos</code>
        </p>
        <label className="block text-sm">
          <span className="text-slate-600 font-medium">APP_NAME</span>
          <input
            value={appName}
            onChange={(e) => setAppName(e.target.value)}
            placeholder="test-pos"
            className="mt-1 w-full px-3 py-2 border rounded-lg font-mono text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-600 font-medium">Access Token (Bearer)</span>
          <textarea
            value={accessToken}
            onChange={(e) => setAccessToken(e.target.value)}
            rows={3}
            placeholder="eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9…"
            className="mt-1 w-full px-3 py-2 border rounded-lg font-mono text-xs"
          />
          {row?.access_token && accessToken === row.access_token && (
            <span className="text-xs text-slate-400 mt-1 block">Kayıtlı: {maskToken(row.access_token)}</span>
          )}
        </label>
        <label className="block text-sm">
          <span className="text-slate-600 font-medium">API kök (genelde değiştirmeyin)</span>
          <input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            className="mt-1 w-full px-3 py-2 border rounded-lg text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-600 font-medium">Şube</span>
          <select
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            className="mt-1 w-full px-3 py-2 border rounded-lg"
          >
            <option value="">Tüm şubeler</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            <span className="font-medium">Entegrasyon aktif</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={isTestMode} onChange={(e) => setIsTestMode(e.target.checked)} />
            <span className="font-medium">Yalnızca test (gerçek sipariş gönderilmez)</span>
          </label>
          <p className="text-xs text-slate-500 pl-6">
            HemenYolda sertifikasyonu bitene kadar işaretli bırakın. Canlıya geçince kapatın.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold text-sm disabled:opacity-50"
          >
            {saving ? 'Kaydediliyor…' : 'Kaydet'}
          </button>
          <button
            type="button"
            onClick={copyEndpoints}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm font-medium flex items-center gap-1"
          >
            <Copy className="w-4 h-4" />
            {copied ? 'Kopyalandı' : 'Endpoint şablonu'}
          </button>
        </div>
        {row?.last_push_at && (
          <p className="text-xs text-slate-500">
            Son başarılı gönderim: {new Date(row.last_push_at).toLocaleString('tr-TR')}
            {row.branch_id ? ` · ${branches.find((b) => b.id === row.branch_id)?.name ?? ''}` : ''}
          </p>
        )}
      </div>

      <div className="border border-amber-200 rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => setShowCertTests((v) => !v)}
          className="w-full flex items-center gap-2 px-4 py-3 bg-amber-50 hover:bg-amber-100 text-amber-900 font-semibold text-sm"
        >
          <FlaskConical className="w-4 h-4" />
          <span className="flex-1 text-left">Sertifikasyon ve testler</span>
          <ChevronDown className={`w-4 h-4 transition-transform ${showCertTests ? 'rotate-180' : ''}`} />
        </button>
        {showCertTests && (
          <div className="bg-amber-50 border-t border-amber-200 p-4 space-y-3">
            <p className="text-sm text-amber-800">
              Önce <strong>Kaydet</strong>. Sipariş tarihleri otomatik <strong>bugün (TR)</strong> gönderilir.
              Sertifikasyon paketi doküman id’leri kullanır. Başarı: <strong>HTTP 204</strong>.
            </p>
        <button
          type="button"
          disabled={!!testing}
          onClick={async () => {
            if (!row?.id || !accessToken.trim()) {
              alert('Önce kaydedin.');
              return;
            }
            setTesting('cert');
            setTestResult('Sertifikasyon gönderiliyor…');
            const order: HemenyoldaTestSample[] = ['getir', 'yemeksepeti', 'trendyol', 'telefon', 'update', 'cancel'];
            const ids: string[] = [];
            for (const s of order) {
              const res = await sendHemenYoldaTestSample(s, true);
              ids.push(`${s}: ${HEMENYOLDA_CERT_MAIL_ORDER_IDS[s]}`);
              if (!res.ok && res.status !== 204) {
                setTesting(null);
                setTestResult(`Sertifikasyon durdu (${s}): ${res.hint || res.error}`);
                return;
              }
            }
            setTesting(null);
            setTestResult(`Sertifikasyon tamam. Mailde iletin:\n${ids.join('\n')}`);
          }}
          className="w-full px-3 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-bold disabled:opacity-50"
        >
          {testing === 'cert' ? 'Gönderiliyor…' : 'Sertifikasyon paketi (doküman ID — HemenYolda maili)'}
        </button>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {TEST_BUTTONS.map(({ sample, label }) => (
            <button
              key={sample}
              type="button"
              disabled={!!testing}
              onClick={() => runTest(sample)}
              className="flex items-center justify-center gap-2 px-3 py-2.5 bg-white border border-amber-300 rounded-lg text-sm font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
            >
              <Send className="w-4 h-4 shrink-0" />
              {testing === sample ? 'Gönderiliyor…' : label}
            </button>
          ))}
        </div>
        {testResult && (
          <p
            className={`text-sm flex items-start gap-2 ${
              testResult.includes('başarılı') || testResult.includes('kaydedildi')
                ? 'text-emerald-800'
                : 'text-red-800'
            }`}
          >
            {testResult.includes('hata') ? (
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            ) : (
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            )}
            {testResult}
          </p>
        )}
          </div>
        )}
      </div>
    </div>
  );
}
