import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useActiveShift } from '../lib/useActiveShift';
import { supabase } from '../lib/supabase';
import { PlayCircle, X, RefreshCw, AlertTriangle, ChevronDown, Layers, Lock } from 'lucide-react';
import { shiftIcon } from '../lib/businessDay';

interface ShiftDefRow {
  id: string;
  shift_no: number;
  name: string;
  start_time: string | null;
  end_time: string | null;
  color: string | null;
  is_active: boolean;
}

/**
 * Vardiya sistemi acikken (tenant.shifts_enabled), kullanicinin acik
 * vardiyasi yoksa giris sonrasi otomatik olarak basitlestirilmis bir
 * "Vardiyanizi baslatin" modal'i gosterir. Atla seceneklidir; atlanirsa
 * o oturumda tekrar gosterilmez.
 *
 * - Kullanicinin profile.shift_definition_id atanmissa o vardiya secili gelir
 *   ve "Vardiyamı Başlat" tek tikla baslatir.
 * - Atama yoksa, tanimli vardiyalardan birini secmesi istenir.
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
  const [defs, setDefs] = useState<ShiftDefRow[]>([]);
  const [selectedDefId, setSelectedDefId] = useState<string | null>(null);

  const eligible = !!permissions?.can_use_shifts;
  const assignedDefId = (profile as any)?.shift_definition_id as string | null | undefined;

  // Tanimlari yukle
  useEffect(() => {
    if (!shiftsEnabled || !tenantId || !branchId) return;
    let alive = true;
    (async () => {
      const { data } = await (supabase as any)
        .from('shift_definitions')
        .select('id, shift_no, name, start_time, end_time, color, is_active')
        .eq('tenant_id', tenantId)
        .eq('branch_id', branchId)
        .eq('is_active', true)
        .order('shift_no', { ascending: true });
      if (alive) setDefs(((data || []) as ShiftDefRow[]));
    })();
    return () => { alive = false; };
  }, [shiftsEnabled, tenantId, branchId]);

  // Atanmissa onu sec, yoksa ilk aktif vardiyayi sec
  useEffect(() => {
    if (!defs.length) return;
    if (assignedDefId && defs.some((d) => d.id === assignedDefId)) {
      setSelectedDefId(assignedDefId);
    } else {
      // Saatten oneri (1..3 mantigi degilse ilk vardiya)
      const h = new Date().getHours();
      const slot = h >= 6 && h < 14 ? 1 : h >= 14 && h < 22 ? 2 : 3;
      const found = defs.find((d) => d.shift_no === slot) || defs[0];
      setSelectedDefId(found?.id || null);
    }
  }, [defs, assignedDefId]);

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
    if (!selectedDefId && defs.length > 0) {
      setError('Lütfen başlatmak istediğiniz vardiyayı seçin.');
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
        p_shift_definition_id: selectedDefId,
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

  const selectedDef = useMemo(
    () => defs.find((d) => d.id === selectedDefId) || null,
    [defs, selectedDefId],
  );
  const HeaderIcon = selectedDef ? shiftIcon(selectedDef.shift_no) : Layers;
  const isAssigned = !!assignedDefId && selectedDefId === assignedDefId;

  if (!shiftsEnabled) return null;

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
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-orange-500 via-rose-500 to-orange-600 text-white px-5 py-5 text-center relative">
              <button onClick={handleSkip} disabled={opening} className="absolute right-3 top-3 p-1.5 rounded-lg hover:bg-white/10">
                <X className="w-4 h-4" />
              </button>
              <div className="w-14 h-14 mx-auto rounded-2xl bg-white/20 flex items-center justify-center backdrop-blur mb-2">
                <HeaderIcon className="w-7 h-7" />
              </div>
              <p className="text-[10px] uppercase font-black tracking-widest opacity-90">Hoş geldiniz</p>
              <h3 className="text-xl font-black mt-0.5">{profile?.full_name || 'Kullanıcı'}</h3>
              <p className="text-xs opacity-90 mt-1">
                {isAssigned ? 'Atanmış vardiyanız hazır.' : defs.length > 0 ? 'Başlatmak istediğiniz vardiyayı seçin.' : 'Vardiyanızı başlatmak ister misiniz?'}
              </p>
            </div>
            <div className="p-5 space-y-3">
              {/* Vardiya secimi */}
              {defs.length > 0 && (
                <div>
                  <label className="text-xs font-bold text-slate-600 mb-1.5 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5" /> Vardiya
                    {isAssigned && (
                      <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-black text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                        <Lock className="w-2.5 h-2.5" /> SİZE ATANDI
                      </span>
                    )}
                  </label>
                  {defs.length === 1 || isAssigned ? (
                    selectedDef && (
                      <div className="flex items-center gap-2 p-3 rounded-xl border-2 border-orange-300 bg-orange-50">
                        {(() => { const I = shiftIcon(selectedDef.shift_no); return <I className="w-5 h-5 text-orange-600" />; })()}
                        <div className="flex-1 min-w-0">
                          <div className="font-black text-sm text-slate-800 truncate">{selectedDef.name}</div>
                          {selectedDef.start_time && selectedDef.end_time && (
                            <div className="text-[11px] text-slate-500">
                              {selectedDef.start_time.slice(0, 5)} – {selectedDef.end_time.slice(0, 5)}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {defs.map((d) => {
                        const I = shiftIcon(d.shift_no);
                        const sel = selectedDefId === d.id;
                        return (
                          <button
                            key={d.id}
                            type="button"
                            onClick={() => setSelectedDefId(d.id)}
                            className={`p-2.5 rounded-xl border-2 text-center transition ${
                              sel ? 'border-orange-400 bg-orange-50 shadow' : 'border-slate-200 hover:border-orange-200 hover:bg-slate-50'
                            }`}
                          >
                            <I className={`w-5 h-5 mx-auto ${sel ? 'text-orange-600' : 'text-slate-400'}`} />
                            <div className={`text-[11px] font-black mt-1 truncate ${sel ? 'text-orange-700' : 'text-slate-700'}`}>{d.name}</div>
                            {d.start_time && d.end_time && (
                              <div className="text-[10px] text-slate-400">{d.start_time.slice(0, 5)}–{d.end_time.slice(0, 5)}</div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

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
                disabled={opening || (defs.length > 0 && !selectedDefId)}
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
