import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Lock, Delete, AlertCircle, LogIn } from 'lucide-react';

interface PinLockScreenProps {
  onUnlock: () => void;
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

  const dateStr = time.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' });
  const timeStr = time.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="fixed inset-0 z-[9999] bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col items-center justify-between select-none overflow-hidden">
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
      </div>
    </div>
  );
}
