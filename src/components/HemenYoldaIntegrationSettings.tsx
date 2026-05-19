import { useCallback, useEffect, useState } from 'react';
import { Copy, Send, AlertCircle, CheckCircle2, ChevronDown, FlaskConical, Mail } from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  maskToken,
  sendHemenYoldaTestSample,
  HEMENYOLDA_CERT_MAIL_ORDER_IDS,
  HEMENYOLDA_CERT_SEQUENCE,
  HEMENYOLDA_CERT_STEP_LABELS,
  buildHemenYoldaCertMailText,
  isHemenYoldaTestSuccess,
  type HemenYoldaIntegrationRow,
  type HemenYoldaPushResult,
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

type CertStepResult = {
  sample: HemenyoldaTestSample;
  ok: boolean;
  status?: number;
  orderId: string;
  detail?: string;
};

const ADVANCED_TESTS: { sample: HemenyoldaTestSample; label: string }[] = [
  { sample: 'getir', label: 'Getir (tekil — mail için değil)' },
  { sample: 'yemeksepeti', label: 'YemekSepeti (tekil)' },
  { sample: 'trendyol', label: 'Trendyol (tekil)' },
  { sample: 'telefon', label: 'Telefon (tekil)' },
  { sample: 'update', label: 'Güncelleme (tekil)' },
  { sample: 'cancel', label: 'İptal (tekil)' },
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
  const [certSteps, setCertSteps] = useState<CertStepResult[] | null>(null);
  const [certDone, setCertDone] = useState(false);
  const [appName, setAppName] = useState('test-pos');
  const [accessToken, setAccessToken] = useState('');
  const [baseUrl, setBaseUrl] = useState('https://hemenyolda.com');
  const [branchId, setBranchId] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [isTestMode, setIsTestMode] = useState(true);
  const [copied, setCopied] = useState(false);
  const [mailCopied, setMailCopied] = useState(false);
  const [showCertTests, setShowCertTests] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('henemyolda_integrations')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const r = data as HemenYoldaIntegrationRow | null;
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
    setTestResult('Adım 1 tamam: ayarlar kaydedildi. Şimdi Adım 2 — sertifikasyon paketini gönderin.');
    setCertSteps(null);
    setCertDone(false);
  };

  const runCertification = async () => {
    if (!row?.id || !accessToken.trim()) {
      alert('Önce HemenYolda’dan gelen APP_NAME ve token’ı girip Kaydet’e basın.');
      return;
    }
    setTesting('cert');
    setTestResult(null);
    setCertDone(false);
    const results: CertStepResult[] = [];

    for (const sample of HEMENYOLDA_CERT_SEQUENCE) {
      setTestResult(`${HEMENYOLDA_CERT_STEP_LABELS[sample]} gönderiliyor…`);
      const res: HemenYoldaPushResult = await sendHemenYoldaTestSample(sample, true);
      const ok = isHemenYoldaTestSuccess(res);
      const step: CertStepResult = {
        sample,
        ok,
        status: res.status,
        orderId: HEMENYOLDA_CERT_MAIL_ORDER_IDS[sample],
        detail: ok
          ? res.note || res.hint || `HTTP ${res.status ?? 204}`
          : res.hint || res.error || res.message || 'Bilinmeyen hata',
      };
      results.push(step);
      setCertSteps([...results]);

      if (!ok) {
        setTesting(null);
        setTestResult(`Sertifikasyon Adım ${results.length} başarısız (${sample}): ${step.detail}`);
        return;
      }
      await new Promise((r) => setTimeout(r, 400));
    }

    setTesting(null);
    setCertDone(true);
    await load();
    setTestResult(
      'Adım 2 tamam: 6/6 sertifikasyon isteği başarılı. Adım 3 — mail metnini kopyalayıp HemenYolda’ya gönderin.',
    );
  };

  const copyCertMail = async () => {
    const text = buildHemenYoldaCertMailText(appName, baseUrl);
    try {
      await navigator.clipboard.writeText(text);
      setMailCopied(true);
      setTimeout(() => setMailCopied(false), 2500);
    } catch {
      prompt('Mail metni:', text);
    }
  };

  const runAdvancedTest = async (sample: HemenyoldaTestSample) => {
    if (!row?.id || !accessToken.trim()) {
      alert('Önce kaydedin.');
      return;
    }
    setTesting(sample);
    const res = await sendHemenYoldaTestSample(sample, false);
    setTesting(null);
    if (isHemenYoldaTestSuccess(res)) {
      setTestResult(`${sample}: OK (HTTP ${res.status ?? 204}) — id: ${res.order_id ?? '—'}`);
    } else {
      setTestResult(`${sample}: hata — ${res.hint || res.error || res.message}`);
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

  const step1Done = !!row?.id && !!row.access_token;
  const step2Done = certDone && certSteps?.every((s) => s.ok);

  return (
    <div className="space-y-4">
      {!embedded && (
        <div className="bg-gradient-to-r from-emerald-600 to-teal-700 rounded-xl p-4 md:p-5 text-white">
          <h3 className="text-lg font-bold mb-2">HemenYolda</h3>
          <p className="text-emerald-50 text-sm">Paket siparişleri otomatik webhook ile gider.</p>
        </div>
      )}

      <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50/80 p-4 space-y-2">
        <h4 className="font-bold text-emerald-900 text-sm">Sertifikasyon — 3 adım</h4>
        <ol className="text-sm text-emerald-900 space-y-1.5 list-decimal list-inside">
          <li className={step1Done ? 'font-semibold' : ''}>
            {step1Done ? '✓ ' : ''}APP_NAME + token gir → <strong>Kaydet</strong>
          </li>
          <li className={step2Done ? 'font-semibold' : ''}>
            {step2Done ? '✓ ' : ''}
            <strong>Sertifikasyon paketi</strong> (6 istek, doküman id)
          </li>
          <li>
            <strong>Mail metnini kopyala</strong> → HemenYolda destek
          </li>
        </ol>
        <p className="text-xs text-emerald-800">
          Tek tek test butonlarını mail için kullanmayın; rastgele sipariş id üretirler.
        </p>
      </div>

      <div className={embedded ? 'space-y-4' : 'bg-white rounded-xl border border-slate-200 p-4 space-y-4'}>
        <h4 className="font-bold text-slate-800">Adım 1 — Bağlantı bilgileri</h4>
        <p className="text-xs text-slate-500">
          HemenYolda mailindeki <strong>APP_NAME</strong> ve <strong>Access Token</strong> (genelde{' '}
          <code className="bg-slate-100 px-1 rounded">test-pos</code>).
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
          <span className="text-slate-600 font-medium">API kök</span>
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
            <option value="">Tüm şubeler (önerilen)</option>
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
            <span className="font-medium">Yalnızca test modu</span>
          </label>
        </div>
        <p className="text-xs text-slate-500">Sertifikasyon bitene kadar test modu açık kalsın.</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold text-sm disabled:opacity-50"
          >
            {saving ? 'Kaydediliyor…' : 'Kaydet (Adım 1)'}
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
          </p>
        )}
      </div>

      <div className="border border-amber-300 rounded-xl overflow-hidden shadow-sm">
        <button
          type="button"
          onClick={() => setShowCertTests((v) => !v)}
          className="w-full flex items-center gap-2 px-4 py-3 bg-amber-100 hover:bg-amber-200 text-amber-950 font-semibold text-sm"
        >
          <FlaskConical className="w-4 h-4" />
          <span className="flex-1 text-left">Adım 2 — Sertifikasyon paketi (6 istek)</span>
          <ChevronDown className={`w-4 h-4 transition-transform ${showCertTests ? 'rotate-180' : ''}`} />
        </button>
        {showCertTests && (
          <div className="bg-amber-50 border-t border-amber-200 p-4 space-y-3">
            <button
              type="button"
              disabled={!!testing}
              onClick={runCertification}
              className="w-full px-4 py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-bold disabled:opacity-50"
            >
              {testing === 'cert' ? 'Gönderiliyor (6 adım)…' : 'Sertifikasyon paketini gönder'}
            </button>

            {certSteps && certSteps.length > 0 && (
              <ul className="space-y-1.5 text-sm">
                {certSteps.map((s) => (
                  <li
                    key={s.sample}
                    className={`flex items-start gap-2 rounded-lg px-2 py-1.5 ${
                      s.ok ? 'bg-emerald-100 text-emerald-900' : 'bg-red-100 text-red-900'
                    }`}
                  >
                    {s.ok ? (
                      <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    )}
                    <span>
                      <strong>{HEMENYOLDA_CERT_STEP_LABELS[s.sample]}</strong>
                      <br />
                      <span className="font-mono text-xs">{s.orderId}</span>
                      {s.detail ? ` — ${s.detail}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {step2Done && (
              <div className="border border-emerald-300 rounded-lg p-3 bg-white space-y-2">
                <h5 className="font-bold text-emerald-900 text-sm flex items-center gap-2">
                  <Mail className="w-4 h-4" />
                  Adım 3 — Maili gönderin
                </h5>
                <button
                  type="button"
                  onClick={copyCertMail}
                  className="w-full px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold"
                >
                  {mailCopied ? 'Mail metni kopyalandı' : 'HemenYolda mail metnini kopyala'}
                </button>
                <p className="text-xs text-slate-600">
                  Kopyalayıp HemenYolda’nın size yazdığı destek adresine gönderin. Yanıt 1–3 iş günü sürebilir.
                </p>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="text-xs text-amber-800 underline"
            >
              {showAdvanced ? 'Gelişmiş tekil testleri gizle' : 'Gelişmiş tekil testler (mail için değil)'}
            </button>
            {showAdvanced && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                {ADVANCED_TESTS.map(({ sample, label }) => (
                  <button
                    key={sample}
                    type="button"
                    disabled={!!testing}
                    onClick={() => runAdvancedTest(sample)}
                    className="flex items-center gap-2 px-3 py-2 bg-white border border-amber-300 rounded-lg text-xs font-medium text-amber-900 disabled:opacity-50"
                  >
                    <Send className="w-3 h-3 shrink-0" />
                    {testing === sample ? '…' : label}
                  </button>
                ))}
              </div>
            )}

            {testResult && (
              <p
                className={`text-sm flex items-start gap-2 ${
                  testResult.includes('hata') || testResult.includes('başarısız')
                    ? 'text-red-800'
                    : 'text-emerald-800'
                }`}
              >
                {testResult.includes('hata') || testResult.includes('başarısız') ? (
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                )}
                <span className="whitespace-pre-wrap">{testResult}</span>
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
