import { useCallback, useEffect, useState } from 'react';
import { Copy, Key, Plus, RefreshCw, AlertCircle, BookOpen } from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  generatePartnerApiKey,
  maskPartnerApiKey,
  partnerOrdersApiBaseUrl,
  type PartnerApiClientRow,
} from '../lib/partnerOrdersApi';

interface Branch {
  id: string;
  name: string;
}

interface Props {
  tenantId: string;
  branches: Branch[];
  activeBranchId: string | null;
  userId: string | null;
  onClientsChange?: (count: number, activeCount: number) => void;
}

export default function PartnerPullApiSettings({
  tenantId,
  branches,
  activeBranchId,
  userId,
  onClientsChange,
}: Props) {
  const [rows, setRows] = useState<PartnerApiClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [partnerName, setPartnerName] = useState('');
  const [branchId, setBranchId] = useState('');
  const [partnerReference, setPartnerReference] = useState('');
  const [newKeyOnce, setNewKeyOnce] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const apiBase = partnerOrdersApiBaseUrl();
  const docsUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/docs/integrations/partner-orders-api.html`
      : 'https://www.sefpos.com.tr/docs/integrations/partner-orders-api.html';

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('partner_api_clients')
      .select(
        'id, tenant_id, branch_id, partner_name, partner_reference, api_key, api_key_prefix, is_active, last_used_at, created_at',
      )
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });
    const list = (data as PartnerApiClientRow[]) || [];
    setRows(list);
    onClientsChange?.(list.length, list.filter((r) => r.is_active).length);
    setLoading(false);
  }, [tenantId, onClientsChange]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (activeBranchId && !branchId) setBranchId(activeBranchId);
  }, [activeBranchId, branchId]);

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      alert('Kopyalanamadı');
    }
  };

  const createClient = async () => {
    if (!partnerName.trim()) {
      alert('Firma adı zorunludur');
      return;
    }
    setSaving(true);
    const apiKey = generatePartnerApiKey();
    const { error } = await supabase.from('partner_api_clients').insert({
      tenant_id: tenantId,
      branch_id: branchId || null,
      partner_name: partnerName.trim(),
      partner_reference: partnerReference.trim() || null,
      api_key: apiKey,
      api_key_prefix: apiKey.slice(0, 16),
      is_active: true,
      created_by: userId,
    });
    setSaving(false);
    if (error) {
      alert('Kayıt hatası: ' + error.message);
      return;
    }
    setNewKeyOnce(apiKey);
    setPartnerName('');
    setPartnerReference('');
    await load();
  };

  const toggleActive = async (row: PartnerApiClientRow) => {
    await supabase
      .from('partner_api_clients')
      .update({ is_active: !row.is_active, updated_at: new Date().toISOString() })
      .eq('id', row.id);
    await load();
  };

  const regenerateKey = async (row: PartnerApiClientRow) => {
    if (!confirm(`Yeni anahtar üretilirse ${row.partner_name} eski anahtarı kullanamaz. Devam?`)) return;
    const apiKey = generatePartnerApiKey();
    const { error } = await supabase
      .from('partner_api_clients')
      .update({
        api_key: apiKey,
        api_key_prefix: apiKey.slice(0, 16),
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id);
    if (error) {
      alert(error.message);
      return;
    }
    setNewKeyOnce(apiKey);
    await load();
  };

  const branchLabel = (id: string | null) =>
    !id ? 'Tüm şubeler' : branches.find((b) => b.id === id)?.name || id.slice(0, 8);

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Kurye veya yazılım firması <strong>ŞefPOS’tan sipariş çeker</strong> (REST API). Her firma için ayrı API anahtarı
        oluşturun; anahtarı firmaya iletin.
      </p>

      <div className="bg-slate-50 rounded-lg border border-slate-200 p-3 space-y-2 text-sm">
        <h4 className="font-bold text-slate-800 flex items-center gap-2">
          <Key className="w-4 h-4 text-indigo-600" />
          Firmaya iletilecek bilgiler
        </h4>
        <div>
          <span className="text-slate-500">API kök:</span>
          <div className="flex flex-wrap gap-2 mt-1 items-center">
            <code className="bg-white px-2 py-1 rounded text-xs break-all border">{apiBase}</code>
            <button
              type="button"
              onClick={() => copyText(apiBase)}
              className="text-indigo-700 text-xs font-semibold flex items-center gap-1"
            >
              <Copy className="w-3 h-3" />
              {copied ? 'Kopyalandı' : 'Kopyala'}
            </button>
          </div>
        </div>
        <p className="text-slate-600 text-xs">Auth: Bearer veya X-Api-Key · Öneri: GET /v1/orders?since=… (30 sn)</p>
        <a
          href={docsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm font-semibold text-indigo-800 hover:bg-indigo-50"
        >
          <BookOpen className="w-4 h-4 shrink-0" />
          API dokümantasyonu
        </a>
      </div>

      {newKeyOnce && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-4">
          <p className="font-bold text-amber-900 flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            Yeni anahtar — bir kez gösterilir
          </p>
          <code className="block mt-2 text-xs break-all bg-white p-2 rounded border">{newKeyOnce}</code>
          <button type="button" onClick={() => copyText(newKeyOnce)} className="mt-2 text-sm font-semibold text-amber-800">
            Anahtarı kopyala
          </button>
          <button type="button" onClick={() => setNewKeyOnce(null)} className="block mt-2 text-xs underline text-amber-700">
            Gizle
          </button>
        </div>
      )}

      <div className="rounded-lg border border-slate-200 p-4 space-y-3 bg-white">
        <h4 className="font-bold text-slate-800">Yeni firma anahtarı</h4>
        <label className="block text-sm">
          <span className="text-slate-600 font-medium">Firma adı *</span>
          <input
            value={partnerName}
            onChange={(e) => setPartnerName(e.target.value)}
            placeholder="Örn. KuryeX, Entegratör Y"
            className="mt-1 w-full px-3 py-2 border rounded-lg"
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-600 font-medium">Şube</span>
          <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="mt-1 w-full px-3 py-2 border rounded-lg">
            <option value="">Tüm şubeler</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-slate-600 font-medium">Partner restoran kodu (isteğe bağlı)</span>
          <input
            value={partnerReference}
            onChange={(e) => setPartnerReference(e.target.value)}
            className="mt-1 w-full px-3 py-2 border rounded-lg"
          />
        </label>
        <button
          type="button"
          disabled={saving}
          onClick={createClient}
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg font-semibold disabled:opacity-50 text-sm"
        >
          <Plus className="w-4 h-4" />
          {saving ? 'Oluşturuluyor…' : 'API anahtarı oluştur'}
        </button>
      </div>

      <div className="space-y-2">
        <h4 className="font-bold text-slate-800 text-sm">Kayıtlı firmalar</h4>
        {loading ? (
          <p className="text-sm text-slate-500">Yükleniyor…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-slate-500">Henüz firma eklenmedi.</p>
        ) : (
          rows.map((row) => (
            <div key={row.id} className="bg-white border border-slate-200 rounded-lg p-3 flex flex-col md:flex-row gap-3 md:items-center">
              <div className="flex-1">
                <div className="font-bold text-slate-900">{row.partner_name}</div>
                <div className="text-xs text-slate-500 mt-1">
                  Şube: {branchLabel(row.branch_id)} · {maskPartnerApiKey(row.api_key)}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => toggleActive(row)} className="px-3 py-1.5 rounded-lg text-xs font-bold border">
                  {row.is_active ? '● Aktif' : '○ Pasif'}
                </button>
                <button
                  type="button"
                  onClick={() => regenerateKey(row)}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold border flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" />
                  Yenile
                </button>
                <button
                  type="button"
                  onClick={() => copyText(row.api_key)}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold border text-indigo-700 flex items-center gap-1"
                >
                  <Copy className="w-3 h-3" />
                  Kopyala
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
