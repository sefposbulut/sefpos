import { useCallback, useEffect, useState } from 'react';
import { Gift, Loader2, Save, Sparkles } from 'lucide-react';
import {
  DEFAULT_LOYALTY_SETTINGS,
  fetchLoyaltySettings,
  saveLoyaltySettings,
  type LoyaltySettings,
} from '../../lib/loyalty';

type Props = {
  tenantId: string;
  /** Ayarlar modalı içinde — üst başlık kısaltılır */
  embedded?: boolean;
};

export function LoyaltySettingsPanel({ tenantId, embedded }: Props) {
  const [settings, setSettings] = useState<LoyaltySettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const s = await fetchLoyaltySettings(tenantId);
    setSettings(s);
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    setMsg(null);
    const res = await saveLoyaltySettings(tenantId, {
      enabled: settings.enabled,
      spend_tl_for_one_point: Math.max(1, settings.spend_tl_for_one_point),
      redeem_tl_per_point: Math.max(0.01, settings.redeem_tl_per_point),
      min_redeem_points: Math.max(0, settings.min_redeem_points),
      welcome_bonus_points: Math.max(0, settings.welcome_bonus_points),
    });
    setSaving(false);
    setMsg(res.ok ? 'Kaydedildi.' : res.error || 'Kayıt başarısız');
    if (res.ok) void load();
  };

  const s = settings ?? { tenant_id: tenantId, ...DEFAULT_LOYALTY_SETTINGS };

  return (
    <div className="space-y-4">
      {!embedded && (
        <div className="bg-gradient-to-r from-orange-500 to-red-600 rounded-xl p-4 md:p-6 text-white shadow-md">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center">
              <Gift className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg md:text-2xl font-black">Sadakat programı</h3>
              <p className="text-orange-100 text-sm">Ödeme ekranından puan kazanma ve kullanma</p>
            </div>
          </div>
        </div>
      )}

      <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4 md:p-5 space-y-4">
        {embedded && (
          <div className="flex items-center gap-2 pb-1 border-b border-slate-100">
            <Gift className="w-5 h-5 text-orange-600" />
            <div>
              <h3 className="font-bold text-slate-800">Sadakat programı</h3>
              <p className="text-xs text-slate-500">
                Puan takibi cari borçtan bağımsızdır; aynı müşteri kartında ikisi de tutulabilir
              </p>
            </div>
          </div>
        )}

        <label className="flex items-center gap-3 cursor-pointer rounded-xl border border-slate-200 px-4 py-3 hover:border-orange-200 transition">
          <input
            type="checkbox"
            checked={s.enabled}
            onChange={(e) => setSettings({ ...s, enabled: e.target.checked })}
            className="w-5 h-5 rounded border-orange-300 text-orange-600 focus:ring-orange-400"
          />
          <span className="font-semibold text-slate-700">Sadakat programı açık</span>
        </label>

        <div className="grid sm:grid-cols-2 gap-4">
          <label className="block rounded-xl border border-slate-200 p-3 hover:border-orange-200 transition">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Kazanma</span>
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <span className="text-sm text-slate-600">Her</span>
              <input
                type="number"
                min={1}
                step={1}
                value={s.spend_tl_for_one_point}
                onChange={(e) =>
                  setSettings({ ...s, spend_tl_for_one_point: Number(e.target.value) || 10 })
                }
                className="w-20 px-2 py-2 border border-slate-200 rounded-lg font-bold text-center focus:outline-none focus:ring-2 focus:ring-orange-300"
              />
              <span className="text-sm text-slate-600">₺ → 1 puan</span>
            </div>
          </label>
          <label className="block rounded-xl border border-slate-200 p-3 hover:border-orange-200 transition">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Kullanma</span>
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <span className="text-sm text-slate-600">1 puan =</span>
              <input
                type="number"
                min={0.01}
                step={0.01}
                value={s.redeem_tl_per_point}
                onChange={(e) =>
                  setSettings({ ...s, redeem_tl_per_point: Number(e.target.value) || 0.1 })
                }
                className="w-20 px-2 py-2 border border-slate-200 rounded-lg font-bold text-center focus:outline-none focus:ring-2 focus:ring-orange-300"
              />
              <span className="text-sm text-slate-600">₺ indirim</span>
            </div>
          </label>
          <label className="block sm:col-span-2 rounded-xl border border-slate-200 p-3 hover:border-orange-200 transition">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">
              Minimum kullanım (puan)
            </span>
            <input
              type="number"
              min={0}
              step={1}
              value={s.min_redeem_points}
              onChange={(e) =>
                setSettings({ ...s, min_redeem_points: Number(e.target.value) || 0 })
              }
              className="mt-2 w-full max-w-xs px-3 py-2 border border-slate-200 rounded-lg font-bold focus:outline-none focus:ring-2 focus:ring-orange-300"
            />
            <p className="text-xs text-slate-500 mt-1">Örn. 20 → en az 20 puan ile indirim başlar</p>
          </label>
        </div>

        <div className="rounded-xl bg-orange-50 border border-orange-100 px-4 py-3 text-sm text-orange-950 flex items-start gap-2">
          <Sparkles className="w-4 h-4 shrink-0 mt-0.5 text-orange-600" />
          <span>
            Örnek: 250 ₺ ödeme →{' '}
            <strong>{Math.floor(250 / (s.spend_tl_for_one_point || 10))} puan</strong> kazanır.
            100 puan kullanırsa <strong>{(100 * s.redeem_tl_per_point).toFixed(0)} ₺</strong> indirim.
          </span>
        </div>

        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 text-white font-bold shadow-md disabled:opacity-50 transition active:scale-[0.98]"
        >
          {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
          Kaydet
        </button>
        {msg && (
          <p
            className={`text-sm font-semibold ${
              msg.includes('Kaydedildi') ? 'text-emerald-600' : 'text-red-600'
            }`}
          >
            {msg}
          </p>
        )}
      </section>
    </div>
  );
}
