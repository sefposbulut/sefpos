import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useActiveShift } from '../lib/useActiveShift';
import { supabase } from '../lib/supabase';
import { PlayCircle, X, Sun, Sunset, Moon, RefreshCw, AlertTriangle, Clock, ChevronDown } from 'lucide-react';

function suggestShiftLabel(): { no: number; name: string; Icon: any } {
  const h = new Date().getHours();
  if (h >= 6 && h < 14) return { no: 1, name: 'Sabah Vardiyası', Icon: Sun };
  if (h >= 14 && h < 22) return { no: 2, name: 'Öğle Vardiyası', Icon: Sunset };
  return { no: 3, name: 'Akşam Vardiyası', Icon: Moon };
}

/**
 * Vardiya sistemi acikken (tenant.shifts_enabled), kullanicinin acik
 * vardiyasi yoksa giris sonrasi otomatik olarak basitlestirilmis bir
 * "Vardiyanizi baslatin" modal'i gosterir. Atla seceneklidir; atlanirsa
 * o oturumda tekrar gosterilmez (ihtiyac olursa Header rozetinden veya
 * Vardiyalar sayfasindan acilabilir).
 *
 * Iptal acik vardiyaya sahip kullanicilara minik bir hosgeldin toast
 * gosterir (5sn).
 */
export function ShiftAutoStartPrompt() {
  const { tenant, user, profile, activeBranch, shiftsEnabled, permissions } = useAuth();
  const tenantId = tenant?.id || null;
  const branchId = activeBranch?.id || null;
  const { activeShift, todayClosure, loading } = useActiveShift({
    tenantId, branchId, userId: user?.id || null, enabled: !!tenantId && shiftsEnabled,
  });

  const sessionKey = tenant && user ? `sefpos_shift_prompt_dismissed_${tenant.id}_${user.id}` : '';
  const welcomeKey = tenant && user ? `sefpos_shift_welcome_shown_${tenant.id}_${user.id}_${activeShift?.id || ''}` : '';

  const [open, setOpen] = useState(false);
  const [welcome, setWelcome] = useState(false);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openingCash, setOpeningCash] = useState<string>('');
  const [showCashField, setShowCashField] = useState<boolean>(false);

  // Sadece "Vardiya Kullan" yetkisi olanlara goster (UserManagement'tan ayarlanir)
  const eligible = !!permissions?.can_use_shifts;

  useEffect(() => {
    if (!shiftsEnabled || loading || !user || !tenant) return;
    if (todayClosure) return;
    if (!eligible) return;

    if (activeShift) {
      const shown = sessionStorage.getItem(welcomeKey);
      if (!shown) {
        setWelcome(true);
        sessionStorage.setItem(welcomeKey, '1');
        const t = window.setTimeout(() => setWelcome(false), 5000);
        return () => window.clearTimeout(t);
      }
      return;
    }

    const dismissed = sessionStorage.getItem(sessionKey);
    if (!dismissed) {
      setOpen(true);
    }
  }, [shiftsEnabled, loading, user, tenant, activeShift, todayClosure, eligible, sessionKey, welcomeKey]);

  const handleStart = async () => {
    if (!branchId) {
      setError('Şube seçimi gerekli. Önce bir şube seçin.');
      return;
    }
    setOpening(true);
    setError(null);
    try {
      const { error: rpcErr } = await (supabase as any).rpc('start_shift', {
        p_branch_id: branchId,
        p_shift_no: null,
        p_opening_cash: Number(openingCash) || 0,
        p_breakdown: null,
        p_terminal_id: null,
        p_terminal_name: null,
        p_notes: null,
      });
      if (rpcErr) throw rpcErr;
      sessionStorage.removeItem(sessionKey);
      setOpen(false);
      setOpeningCash('');
    } catch (e: any) {
      setError(e?.message || 'Vardiya açılamadı');
    } finally {
      setOpening(false);
    }
  };

  const handleSkip = () => {
    sessionStorage.setItem(sessionKey, '1');
    setOpen(false);
  };

  if (!shiftsEnabled) return null;

  const sug = suggestShiftLabel();

  return (
    <>
      {welcome && activeShift && (
        <div className="fixed top-16 md:top-24 right-3 md:right-6 z-[60] max-w-sm bg-white rounded-2xl shadow-2xl border border-emerald-200 overflow-hidden animate-in slide-in-from-right">
          <div className="bg-gradient-to-r from-emerald-500 to-green-600 text-white px-4 py-3 flex items-center gap-2">
            <PlayCircle className="w-5 h-5" />
            <span className="font-black text-sm">Vardiyanız devam ediyor</span>
          </div>
          <div className="p-3 text-sm text-slate-700">
            <p><b>{activeShift.shift_name}</b> — {new Date(activeShift.opened_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}'den beri açık.</p>
            <p className="text-xs text-slate-500 mt-1">İyi çalışmalar {profile?.full_name || ''}!</p>
          </div>
        </div>
      )}

      {open && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-end md:items-center justify-center p-3" onClick={() => !opening && handleSkip()}>
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-orange-500 via-rose-500 to-orange-600 text-white px-5 py-5 text-center relative">
              <button onClick={handleSkip} disabled={opening} className="absolute right-3 top-3 p-1.5 rounded-lg hover:bg-white/10">
                <X className="w-4 h-4" />
              </button>
              <div className="w-14 h-14 mx-auto rounded-2xl bg-white/20 flex items-center justify-center backdrop-blur mb-2">
                <sug.Icon className="w-7 h-7" />
              </div>
              <p className="text-[10px] uppercase font-black tracking-widest opacity-90">Hoş geldiniz</p>
              <h3 className="text-xl font-black mt-0.5">{profile?.full_name || 'Kullanıcı'}</h3>
              <p className="text-xs opacity-90 mt-1">Vardiyanızı başlatmak ister misiniz?</p>
            </div>
            <div className="p-5 space-y-3">
              {!showCashField ? (
                <button
                  type="button"
                  onClick={() => setShowCashField(true)}
                  className="w-full text-xs font-bold text-slate-500 hover:text-orange-600 inline-flex items-center justify-center gap-1.5 py-1"
                >
                  <ChevronDown className="w-3 h-3" /> Açılış nakit ekle (opsiyonel)
                </button>
              ) : (
                <div>
                  <label className="text-xs font-bold text-slate-600 mb-1 block">Kasadaki Açılış Nakit (₺)</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    value={openingCash}
                    onChange={(e) => setOpeningCash(e.target.value)}
                    placeholder="0,00"
                    autoFocus
                    className="w-full px-3 py-2.5 text-lg font-black text-slate-800 rounded-lg border-2 border-slate-200 focus:border-orange-400 focus:ring-4 focus:ring-orange-100 outline-none"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">Boş bırakırsanız 0 ile başlar.</p>
                </div>
              )}

              {error && (
                <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-2 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 mt-0.5" />
                  <span className="flex-1 whitespace-pre-line">{error}</span>
                </div>
              )}

              <button
                onClick={handleStart}
                disabled={opening}
                className="w-full px-5 py-3 rounded-xl bg-gradient-to-r from-orange-500 to-red-600 text-white font-black text-base shadow disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {opening ? <RefreshCw className="w-5 h-5 animate-spin" /> : <PlayCircle className="w-5 h-5" />}
                Vardiyamı Başlat
              </button>

              <button
                onClick={handleSkip}
                disabled={opening}
                className="w-full text-center text-xs font-bold text-slate-400 hover:text-slate-700 py-1"
              >
                Şimdi değil
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
