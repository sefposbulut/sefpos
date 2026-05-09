import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useActiveShift } from '../lib/useActiveShift';
import { supabase } from '../lib/supabase';
import { PlayCircle, X, Sun, Sunset, Moon, RefreshCw, AlertTriangle, Clock } from 'lucide-react';

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

  // Eligible roles: cashier, manager, waiter, owner, admin
  const eligibleRole = profile?.role && ['owner', 'admin', 'manager', 'cashier', 'waiter'].includes(profile.role);

  useEffect(() => {
    if (!shiftsEnabled || loading || !user || !tenant) return;
    if (todayClosure) return;
    if (!eligibleRole) return;

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
  }, [shiftsEnabled, loading, user, tenant, activeShift, todayClosure, eligibleRole, sessionKey, welcomeKey]);

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
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-orange-500 via-rose-500 to-orange-600 text-white px-5 py-4 flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur">
                <sug.Icon className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] uppercase font-black tracking-widest opacity-90">Hoş geldiniz</p>
                <h3 className="text-lg font-black truncate">{profile?.full_name || 'Kullanıcı'}</h3>
              </div>
              <button onClick={handleSkip} disabled={opening} className="p-2 rounded-lg hover:bg-white/10">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 flex items-start gap-3">
                <Clock className="w-5 h-5 text-orange-600 mt-0.5" />
                <div>
                  <p className="font-black text-orange-900 text-sm">Vardiyanızı başlatın</p>
                  <p className="text-xs text-orange-800 mt-0.5">
                    Şu anki saate göre önerilen vardiya: <b>{sug.name}</b>. Kasaya başlangıç tutarınızı girip başlatın — tüm satışlarınız bu vardiyaya kaydedilir.
                  </p>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 mb-1 block">Açılış Nakit (₺)</label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={openingCash}
                  onChange={(e) => setOpeningCash(e.target.value)}
                  placeholder="0,00"
                  autoFocus
                  className="w-full px-4 py-3 text-2xl font-black text-slate-800 rounded-xl border-2 border-slate-200 focus:border-orange-400 focus:ring-4 focus:ring-orange-100 outline-none"
                />
                <p className="text-[11px] text-slate-500 mt-1">Kasaya koyduğunuz para üstü / yedek nakit. Boşsa 0 ile başlar.</p>
              </div>

              {error && (
                <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-2 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 mt-0.5" />
                  <span className="flex-1 whitespace-pre-line">{error}</span>
                </div>
              )}
            </div>
            <div className="px-5 py-4 bg-slate-50 border-t border-slate-200 flex items-center gap-2 justify-end">
              <button
                onClick={handleSkip}
                disabled={opening}
                className="px-4 py-2.5 rounded-lg text-sm font-bold text-slate-600 hover:bg-slate-100"
              >
                Şimdi değil
              </button>
              <button
                onClick={handleStart}
                disabled={opening}
                className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-orange-500 to-red-600 text-white font-black text-sm shadow disabled:opacity-50 flex items-center gap-2"
              >
                {opening ? <RefreshCw className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />}
                Vardiyamı Başlat
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
