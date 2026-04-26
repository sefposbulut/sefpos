import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Lock, Delete, AlertCircle, LogIn, RotateCcw, X, Trash2, AlertTriangle } from 'lucide-react';

interface PinLockScreenProps {
  onUnlock: () => void;
}

function ResetConfirmModal({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  const [typed, setTyped] = useState('');
  const [resetting, setResetting] = useState(false);
  const CONFIRM_WORD = 'SIFIRLA';

  const handleConfirm = async () => {
    setResetting(true);
    await onConfirm();
    setResetting(false);
  };

  return (
    <div className="fixed inset-0 z-[10000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h3 className="font-black text-slate-800">Sistemi Sıfırla</h3>
            <p className="text-xs text-slate-500">Bu işlem geri alınamaz</p>
          </div>
          <button onClick={onCancel} className="ml-auto p-2 hover:bg-slate-100 rounded-lg transition">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-5">
          <p className="text-sm text-red-700 font-semibold mb-1">Sıfırlama işlemi şunları siler:</p>
          <ul className="text-sm text-red-600 space-y-1 mt-2">
            <li className="flex items-center gap-2"><Trash2 className="w-3 h-3" /> Tüm masalar ve masa grupları</li>
            <li className="flex items-center gap-2"><Trash2 className="w-3 h-3" /> Tüm sipariş geçmişi</li>
            <li className="flex items-center gap-2"><Trash2 className="w-3 h-3" /> Tüm kasa işlemleri</li>
            <li className="flex items-center gap-2"><Trash2 className="w-3 h-3" /> Tüm ürünler ve kategoriler</li>
            <li className="flex items-center gap-2"><Trash2 className="w-3 h-3" /> Online sipariş platformları</li>
          </ul>
          <p className="text-xs text-red-500 mt-3">Kullanıcılar, şubeler ve hesap bilgileri korunur.</p>
        </div>

        <div className="mb-5">
          <label className="block text-sm font-bold text-slate-700 mb-2">
            Onaylamak için <span className="text-red-600 font-black">{CONFIRM_WORD}</span> yazın
          </label>
          <input
            type="text"
            value={typed}
            onChange={e => setTyped(e.target.value.toUpperCase())}
            placeholder={CONFIRM_WORD}
            className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 focus:ring-2 focus:ring-red-400 focus:border-transparent font-mono text-center font-bold tracking-widest text-lg"
          />
        </div>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-3 rounded-xl border-2 border-slate-200 text-slate-600 font-semibold text-sm transition hover:bg-slate-50"
          >
            Vazgeç
          </button>
          <button
            onClick={handleConfirm}
            disabled={typed !== CONFIRM_WORD || resetting}
            className="flex-1 py-3 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white font-bold text-sm transition flex items-center justify-center gap-2"
          >
            {resetting ? (
              <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Sıfırlanıyor...</>
            ) : (
              <><Trash2 className="w-4 h-4" /> Sistemi Sıfırla</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export function PinLockScreen({ onUnlock }: PinLockScreenProps) {
  const { tenant, profile } = useAuth();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [shake, setShake] = useState(false);
  const [checking, setChecking] = useState(false);
  const [time, setTime] = useState(new Date());
  const [attempts, setAttempts] = useState(0);
  const [locked, setLocked] = useState(false);
  const [lockCountdown, setLockCountdown] = useState(0);
  const [showResetModal, setShowResetModal] = useState(false);
  const lockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (locked && lockCountdown > 0) {
      lockTimerRef.current = setTimeout(() => {
        setLockCountdown(prev => {
          if (prev <= 1) { setLocked(false); setAttempts(0); return 0; }
          return prev - 1;
        });
      }, 1000);
    }
    return () => { if (lockTimerRef.current) clearTimeout(lockTimerRef.current); };
  }, [locked, lockCountdown]);

  const handleDigit = (d: string) => {
    if (locked || checking) return;
    if (pin.length >= 6) return;
    const next = pin + d;
    setPin(next);
    setError('');
    if (next.length === 4 || next.length === 6) {
      verifyPin(next);
    }
  };

  const handleDelete = () => {
    if (locked || checking) return;
    setPin(prev => prev.slice(0, -1));
    setError('');
  };

  const verifyPin = async (entered: string) => {
    if (!tenant) return;
    setChecking(true);

    const { data } = await supabase
      .from('tenants')
      .select('lock_pin')
      .eq('id', tenant.id)
      .maybeSingle();

    setChecking(false);

    const storedPin = (data as any)?.lock_pin;

    if (!storedPin) {
      onUnlock();
      return;
    }

    if (entered === storedPin) {
      setPin('');
      setError('');
      setAttempts(0);
      onUnlock();
    } else {
      const newAttempts = attempts + 1;
      setAttempts(newAttempts);
      setPin('');
      triggerError();
      if (newAttempts >= 5) {
        setLocked(true);
        setLockCountdown(30);
        setError(`Çok fazla hatalı giriş. 30 saniye bekleyin.`);
      } else {
        setError(`Yanlış PIN. ${5 - newAttempts} deneme hakkınız kaldı.`);
      }
    }
  };

  const triggerError = () => {
    setShake(true);
    setTimeout(() => setShake(false), 500);
  };

  const handleSystemReset = async () => {
    if (!tenant) return;
    const tid = tenant.id;

    const orderIds = (await supabase.from('orders').select('id').eq('tenant_id', tid)).data?.map((o: any) => o.id) || [];
    if (orderIds.length > 0) {
      await supabase.from('order_items').delete().in('order_id', orderIds);
    }
    await supabase.from('orders').delete().eq('tenant_id', tid);
    await supabase.from('cash_register_transactions').delete().eq('tenant_id', tid);
    await supabase.from('restaurant_tables').delete().eq('tenant_id', tid);
    await supabase.from('table_groups').delete().eq('tenant_id', tid);
    await supabase.from('online_order_platforms').delete().eq('tenant_id', tid);

    const catIds = (await supabase.from('categories').select('id').eq('tenant_id', tid)).data?.map((c: any) => c.id) || [];
    if (catIds.length > 0) {
      await supabase.from('products').delete().in('category_id', catIds);
    }
    await supabase.from('categories').delete().eq('tenant_id', tid);
    await supabase.from('tenants').update({ onboarding_completed: false } as any).eq('id', tid);

    setShowResetModal(false);
    window.location.reload();
  };

  const dateStr = time.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' });
  const timeStr = time.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="fixed inset-0 z-[9999] bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col items-center justify-between select-none overflow-hidden">
      {showResetModal && (
        <ResetConfirmModal
          onConfirm={handleSystemReset}
          onCancel={() => setShowResetModal(false)}
        />
      )}

      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-orange-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/3 right-1/4 w-80 h-80 bg-red-500/5 rounded-full blur-3xl" />
      </div>

      <div className="flex-1 flex flex-col items-center justify-center w-full px-6 pt-8">
        <div className="mb-2 flex items-center gap-2 text-slate-400">
          <Lock className="w-4 h-4" />
          <span className="text-sm font-medium tracking-wide uppercase">Sistem Kilitli</span>
        </div>

        <div className="text-white font-black mb-1" style={{ fontSize: 'clamp(48px, 12vw, 80px)', lineHeight: 1.1 }}>
          {timeStr}
        </div>
        <div className="text-slate-400 text-base font-medium capitalize mb-8">{dateStr}</div>

        {tenant && (
          <div className="mb-6 text-center">
            <div className="text-white font-bold text-lg">{(tenant as any).name}</div>
            {profile && <div className="text-slate-400 text-sm">{(profile as any).full_name}</div>}
          </div>
        )}

        <div className={`flex gap-3 mb-4 transition-all ${shake ? 'animate-bounce' : ''}`}>
          {[0, 1, 2, 3].map(i => (
            <div
              key={i}
              className={`w-4 h-4 rounded-full border-2 transition-all duration-150 ${
                i < pin.length
                  ? 'bg-orange-500 border-orange-500 scale-110'
                  : 'bg-transparent border-slate-500'
              }`}
            />
          ))}
        </div>

        {error && (
          <div className="flex items-center gap-2 text-red-400 text-sm font-medium mb-3 bg-red-500/10 px-4 py-2 rounded-xl border border-red-500/20">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{locked ? `Kilitli — ${lockCountdown}sn` : error}</span>
          </div>
        )}

        {checking && (
          <div className="text-slate-400 text-sm mb-3 flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
            Doğrulanıyor...
          </div>
        )}
      </div>

      <div className="w-full max-w-xs pb-8 px-6">
        <div className="grid grid-cols-3 gap-3 mb-3">
          {['1','2','3','4','5','6','7','8','9'].map(d => (
            <button
              key={d}
              onPointerDown={(e) => { e.currentTarget.style.transform = 'scale(0.92)'; e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; }}
              onPointerUp={(e) => { e.currentTarget.style.transform = ''; e.currentTarget.style.background = ''; handleDigit(d); }}
              onPointerLeave={(e) => { e.currentTarget.style.transform = ''; e.currentTarget.style.background = ''; }}
              disabled={locked || checking}
              className="h-16 rounded-2xl border border-white/10 text-white font-bold text-2xl flex items-center justify-center disabled:opacity-40"
              style={{ background: 'rgba(255,255,255,0.08)', transition: 'transform 0.07s ease' }}
            >
              {d}
            </button>
          ))}
          <button
            onPointerDown={(e) => { e.currentTarget.style.transform = 'scale(0.92)'; }}
            onPointerUp={(e) => { e.currentTarget.style.transform = ''; handleDelete(); }}
            onPointerLeave={(e) => { e.currentTarget.style.transform = ''; }}
            disabled={locked || checking}
            className="h-16 rounded-2xl border border-white/10 text-slate-400 flex items-center justify-center disabled:opacity-40"
            style={{ background: 'rgba(255,255,255,0.04)', transition: 'transform 0.07s ease' }}
          >
            <Delete className="w-6 h-6" />
          </button>
          <button
            onPointerDown={(e) => { e.currentTarget.style.transform = 'scale(0.92)'; e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; }}
            onPointerUp={(e) => { e.currentTarget.style.transform = ''; e.currentTarget.style.background = ''; handleDigit('0'); }}
            onPointerLeave={(e) => { e.currentTarget.style.transform = ''; e.currentTarget.style.background = ''; }}
            disabled={locked || checking}
            className="h-16 rounded-2xl border border-white/10 text-white font-bold text-2xl flex items-center justify-center disabled:opacity-40"
            style={{ background: 'rgba(255,255,255,0.08)', transition: 'transform 0.07s ease' }}
          >
            0
          </button>
          <button
            onPointerDown={(e) => { e.currentTarget.style.transform = 'scale(0.92)'; }}
            onPointerUp={(e) => { e.currentTarget.style.transform = ''; if (pin.length > 0 && !locked && !checking) verifyPin(pin); }}
            onPointerLeave={(e) => { e.currentTarget.style.transform = ''; }}
            disabled={pin.length < 4 || locked || checking}
            className="h-16 rounded-2xl bg-gradient-to-br from-orange-500 to-red-600 text-white flex items-center justify-center disabled:opacity-30"
            style={{ transition: 'transform 0.07s ease' }}
          >
            <LogIn className="w-6 h-6" />
          </button>
        </div>

        <button
          onClick={() => setShowResetModal(true)}
          className="w-full py-3 rounded-2xl border border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300 transition font-semibold text-sm flex items-center justify-center gap-2"
        >
          <RotateCcw className="w-4 h-4" />
          Sistemi Sıfırla
        </button>
      </div>
    </div>
  );
}
