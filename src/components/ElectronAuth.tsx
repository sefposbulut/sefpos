import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { isSqlServerMode, isLocalMode } from '../lib/sqlDb';
import { phoneToAuthEmail } from '../lib/phoneAuthEmail';
import { resolveLoginIdentifier } from '../lib/panelUserLoginResolve';
import { Eye, EyeOff, ChevronLeft, User, Lock, Building2, Phone, Bike, Delete, Cloud, Server, Settings, HardDrive } from 'lucide-react';

const logoSrc = new URL('../../public/logo.png', import.meta.url).href;

const REMEMBER_KEY = 'shefpos_remembered_login';
const REMEMBER_PASSWORD_KEY = 'shefpos_remembered_password';
const ADMIN_LOGIN_EMAIL = 'info@aykasoft.com.tr';
const ADMIN_LOGIN_EMAIL_LEGACY = 'infop@aykasoft.com.tr';
const TEST_LOGIN_EMAIL = 'info@sefpos.com.tr';
const TEST_LOGIN_PHONE = '02363131818';

const isPhoneInput = (val: string) => /^\d[\d\s]*$/.test(val.trim());
const isValidEmail = (val: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.trim());

const formatPhone = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 4) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 4)} ${digits.slice(4)}`;
  if (digits.length <= 9) return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
  return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7, 9)} ${digits.slice(9)}`;
};

function NumpadKey({ label, sub, onPress }: { label: string; sub?: string; onPress: () => void }) {
  return (
    <button
      type="button"
      onPointerDown={(e) => { e.preventDefault(); onPress(); }}
      className="flex flex-col items-center justify-center rounded-2xl bg-white/10 hover:bg-white/20 active:bg-white/30 transition-all select-none"
      style={{ minHeight: 72, touchAction: 'manipulation' }}
    >
      <span className="text-white text-2xl font-semibold leading-none">{label}</span>
      {sub && <span className="text-white/50 text-xs mt-0.5 tracking-widest">{sub}</span>}
    </button>
  );
}

function NumpadBackspace({ onPress }: { onPress: () => void }) {
  return (
    <button
      type="button"
      onPointerDown={(e) => { e.preventDefault(); onPress(); }}
      className="flex items-center justify-center rounded-2xl bg-white/10 hover:bg-white/20 active:bg-white/30 transition-all select-none"
      style={{ minHeight: 72, touchAction: 'manipulation' }}
    >
      <Delete className="w-6 h-6 text-white/80" />
    </button>
  );
}

const numpadRows = [
  [{ d: '1', s: '' }, { d: '2', s: 'ABC' }, { d: '3', s: 'DEF' }],
  [{ d: '4', s: 'GHI' }, { d: '5', s: 'JKL' }, { d: '6', s: 'MNO' }],
  [{ d: '7', s: 'PQRS' }, { d: '8', s: 'TUV' }, { d: '9', s: 'WXYZ' }],
];

interface ElectronAuthProps {
  onCourierMode?: () => void;
  onSwitchMode?: () => void;
  currentDbMode?: 'cloud' | 'sqlserver' | 'postgres' | 'local' | null;
}

export function ElectronAuth({ onCourierMode, onSwitchMode, currentDbMode }: ElectronAuthProps) {
  const [view, setView] = useState<'login' | 'register' | 'courier'>('login');
  const [step, setStep] = useState<'phone' | 'password'>('phone');
  const [loginValue, setLoginValue] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [fullName, setFullName] = useState('');
  const [tenantName, setTenantName] = useState('');
  const [regField, setRegField] = useState<'tenantName' | 'fullName' | 'phone' | 'password'>('tenantName');
  const [error, setError] = useState('');
  const [isSuspended, setIsSuspended] = useState(false);
  const [loading, setLoading] = useState(false);
  const { signIn, signUp } = useAuth();

  const [showNumpad, setShowNumpad] = useState(false);
  const [numpadTarget, setNumpadTarget] = useState<'login' | 'password' | 'fullName' | 'tenantName' | 'phone'>('login');

  const loginInputRef = useRef<HTMLInputElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const fullNameInputRef = useRef<HTMLInputElement>(null);
  const tenantNameInputRef = useRef<HTMLInputElement>(null);
  const phoneInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const savedLogin = localStorage.getItem(REMEMBER_KEY);
    const savedPassword = localStorage.getItem(REMEMBER_PASSWORD_KEY);
    if (savedLogin) { setLoginValue(savedLogin); setRemember(true); }
    if (savedPassword) setPassword(savedPassword);
  }, []);

  useEffect(() => {
    if (step === 'phone' && view === 'login') {
      setTimeout(() => loginInputRef.current?.focus(), 100);
    } else if (step === 'password' && view === 'login') {
      setTimeout(() => passwordInputRef.current?.focus(), 100);
    }
  }, [step, view]);

  useEffect(() => {
    if (view === 'register') {
      setTimeout(() => tenantNameInputRef.current?.focus(), 100);
    }
  }, [view]);

  const resolveEmail = async (val: string): Promise<string | null> => {
    const trimmed = val.trim();

    if (isLocalMode()) {
      if (trimmed.includes('@')) return trimmed.toLowerCase();
      const sanitized = trimmed.toLowerCase().replace(/[^a-z0-9._-]/g, '');
      return `${sanitized}@local.shefpos`;
    }

    if (isSqlServerMode()) {
      const api = (window as any).electronAPI;
      if (trimmed.includes('@')) return trimmed.toLowerCase();
      if (isPhoneInput(trimmed)) return phoneToAuthEmail(trimmed);
      const sanitized = trimmed.toLowerCase().replace(/[^a-z0-9_.-]/g, '');
      if (api?.sqlFindProfileByUsername) {
        try {
          const result = await api.sqlFindProfileByUsername(sanitized);
          if (result?.email) return result.email;
        } catch {}
      }
      return `${sanitized}@shefpos.local`;
    }

    if (isPhoneInput(trimmed)) return phoneToAuthEmail(trimmed);
    if (trimmed.includes('@') && !trimmed.endsWith('@shefpos.local') && trimmed.includes('.'))
      return trimmed.toLowerCase();
    const sanitized = trimmed.toLowerCase().replace(/[^a-z0-9]/g, '');
    const { data } = await supabase
      .from('profiles')
      .select('email')
      .ilike('email', `${sanitized}@%.shefpos.local`)
      .maybeSingle();
    return data?.email || null;
  };

  const handleLogin = async () => {
    setError('');
    if (!loginValue.trim()) { setError('Telefon numarası veya kullanıcı adı girin'); return; }
    if (step === 'phone') { setStep('password'); return; }
    setLoading(true);
    try {
      let email: string | null = null;
      const trimmed = loginValue.trim().toLowerCase();
      const cloudMode = !isSqlServerMode() && !isLocalMode();
      if (cloudMode) {
        if (trimmed === ADMIN_LOGIN_EMAIL || trimmed === ADMIN_LOGIN_EMAIL_LEGACY || trimmed === TEST_LOGIN_EMAIL) {
          email = ADMIN_LOGIN_EMAIL;
          if (trimmed === TEST_LOGIN_EMAIL) email = TEST_LOGIN_EMAIL;
        } else {
          const cleanedDigits = loginValue.replace(/\D/g, '');
          if (cleanedDigits === TEST_LOGIN_PHONE) {
            email = TEST_LOGIN_EMAIL;
          } else {
            const resolved = await resolveLoginIdentifier(loginValue);
            if (!resolved.ok) {
              setError(
                resolved.message ||
                  'Giriş yapılamadı. E-posta, cep telefonu veya kullanıcı adınızı kontrol edin.',
              );
              setLoading(false);
              return;
            }
            email = resolved.email;
          }
        }
      } else {
        email = await resolveEmail(loginValue);
      }
      if (!email) { setError('Kullanıcı bulunamadı'); setLoading(false); return; }
      let result = await signIn(email, password);
      if (
        cloudMode &&
        (trimmed === ADMIN_LOGIN_EMAIL || trimmed === ADMIN_LOGIN_EMAIL_LEGACY) &&
        result.error?.message?.includes('Invalid login credentials')
      ) {
        const fallbackEmail = email === ADMIN_LOGIN_EMAIL ? ADMIN_LOGIN_EMAIL_LEGACY : ADMIN_LOGIN_EMAIL;
        result = await signIn(fallbackEmail, password);
      }
      if (result.error) {
        if ((result as any).suspended) { setIsSuspended(true); setError(result.error.message); setLoading(false); return; }
        const msg = (result.error as any).message || '';
        if (isSqlServerMode()) {
          if (msg.includes('Kullanici bulunamadi') || msg.includes('bulunamadi')) {
            setError('Kullanıcı bulunamadı. Lütfen önce veritabanını kurulum ekranından oluşturun.');
          } else if (msg.includes('Sifre hatali')) {
            setError('Şifre hatalı');
          } else if (msg.includes('tedious') || msg.includes('SQL')) {
            setError('Veritabanı bağlantı hatası: ' + msg.slice(0, 100));
          } else {
            setError(msg || 'Giriş başarısız');
          }
          setLoading(false);
          return;
        }
        throw result.error;
      }
      if (remember) {
        localStorage.setItem(REMEMBER_KEY, loginValue);
        localStorage.setItem(REMEMBER_PASSWORD_KEY, password);
      } else {
        localStorage.removeItem(REMEMBER_KEY);
        localStorage.removeItem(REMEMBER_PASSWORD_KEY);
      }
    } catch (err: any) {
      const msg = err.message || '';
      if (msg.includes('Invalid login credentials')) setError('Kullanıcı adı/telefon veya şifre hatalı');
      else setError(msg || 'Bir hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    setError('');
    if (!fullName || !tenantName || !loginValue || !password) { setError('Lütfen tüm alanları doldurun'); return; }
    const cleaned = loginValue.replace(/\D/g, '');
    if (cleaned.length < 10) { setError('Geçerli bir telefon numarası girin'); return; }
    setLoading(true);
    try {
      const email = phoneToAuthEmail(cleaned);
      const { error } = await signUp(email, password, fullName, tenantName);
      if (error) throw error;
    } catch (err: any) {
      const msg = err.message || '';
      if (msg.includes('User already registered')) setError('Bu telefon numarası zaten kayıtlı');
      else setError(msg || 'Bir hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  const handleNumpadPress = useCallback((digit: string) => {
    if (numpadTarget === 'login' || numpadTarget === 'phone') {
      setLoginValue(prev => {
        const raw = prev.replace(/\D/g, '');
        if (raw.length >= 11) return prev;
        return formatPhone(raw + digit);
      });
    } else if (numpadTarget === 'password') {
      setPassword(p => p + digit);
    } else if (numpadTarget === 'fullName') {
      setFullName(p => p + digit);
    } else if (numpadTarget === 'tenantName') {
      setTenantName(p => p + digit);
    }
  }, [numpadTarget]);

  const handleNumpadDelete = useCallback(() => {
    if (numpadTarget === 'login' || numpadTarget === 'phone') {
      setLoginValue(prev => {
        const raw = prev.replace(/\D/g, '').slice(0, -1);
        return raw ? formatPhone(raw) : '';
      });
    } else if (numpadTarget === 'password') setPassword(p => p.slice(0, -1));
    else if (numpadTarget === 'fullName') setFullName(p => p.slice(0, -1));
    else if (numpadTarget === 'tenantName') setTenantName(p => p.slice(0, -1));
  }, [numpadTarget]);

  const openNumpad = (target: typeof numpadTarget) => {
    setNumpadTarget(target);
    setShowNumpad(true);
  };

  const handlePhoneKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleLogin();
  };

  const handlePasswordKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleLogin();
  };

  const handleLoginChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    const isNumericOnly = /^[\d\s]*$/.test(val);
    if (isNumericOnly && val.replace(/\D/g, '').length > 0) {
      const raw = val.replace(/\D/g, '').slice(0, 11);
      setLoginValue(raw ? formatPhone(raw) : '');
    } else {
      setLoginValue(val);
    }
  };

  const bg = 'linear-gradient(160deg, #0f172a 0%, #1e3a5f 55%, #0f2744 100%)';
  const primaryGrad = 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)';

  const inputBase = "w-full flex-1 bg-transparent text-white text-xl outline-none placeholder-white/30 tracking-wider";
  const fieldBox = (active: boolean) =>
    `w-full flex items-center gap-4 px-6 py-5 rounded-3xl border-2 transition cursor-text ${active ? 'border-blue-500 bg-white/10' : 'border-white/10 bg-white/5 hover:bg-white/8'}`;

  if (view === 'register') {
    return (
      <div className="min-h-screen flex" style={{ background: bg }}>
        <div className="flex-1 flex flex-col items-center justify-center px-10 py-10 relative">
          <button
            type="button"
            onClick={() => { setView('login'); setError(''); setStep('phone'); }}
            className="absolute top-8 left-8 flex items-center gap-2 text-white/60 hover:text-white transition text-base font-medium"
          >
            <ChevronLeft className="w-5 h-5" />
            Giriş
          </button>

          <img src={logoSrc} alt="ŞefPOS" className="h-12 w-auto mb-8 brightness-0 invert opacity-80" />
          <h2 className="text-white text-3xl font-bold mb-2">İşletme Kaydı</h2>
          <p className="text-white/50 text-base mb-10">Yeni hesap oluşturun</p>

          <div className="w-full max-w-sm space-y-4">
            <label className={fieldBox(regField === 'tenantName')} onClick={() => { setRegField('tenantName'); openNumpad('tenantName'); tenantNameInputRef.current?.focus(); }}>
              <Building2 className="w-5 h-5 text-white/50 shrink-0" />
              <input
                ref={tenantNameInputRef}
                type="text"
                value={tenantName}
                onChange={e => setTenantName(e.target.value)}
                onFocus={() => { setRegField('tenantName'); openNumpad('tenantName'); }}
                onKeyDown={e => { if (e.key === 'Enter') { setRegField('fullName'); fullNameInputRef.current?.focus(); } }}
                placeholder="Restoran / İşletme Adı"
                className={inputBase}
                autoComplete="organization"
              />
            </label>

            <label className={fieldBox(regField === 'fullName')} onClick={() => { setRegField('fullName'); openNumpad('fullName'); fullNameInputRef.current?.focus(); }}>
              <User className="w-5 h-5 text-white/50 shrink-0" />
              <input
                ref={fullNameInputRef}
                type="text"
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                onFocus={() => { setRegField('fullName'); openNumpad('fullName'); }}
                onKeyDown={e => { if (e.key === 'Enter') { setRegField('phone'); phoneInputRef.current?.focus(); } }}
                placeholder="Ad Soyad"
                className={inputBase}
                autoComplete="name"
              />
            </label>

            <label className={fieldBox(regField === 'phone')} onClick={() => { setRegField('phone'); openNumpad('phone'); phoneInputRef.current?.focus(); }}>
              <Phone className="w-5 h-5 text-white/50 shrink-0" />
              <input
                ref={phoneInputRef}
                type="tel"
                value={loginValue}
                onChange={e => { const raw = e.target.value.replace(/\D/g, '').slice(0, 11); setLoginValue(raw ? formatPhone(raw) : ''); }}
                onFocus={() => { setRegField('phone'); openNumpad('phone'); }}
                onKeyDown={e => { if (e.key === 'Enter') { setRegField('password'); passwordInputRef.current?.focus(); } }}
                placeholder="Telefon Numarası"
                className={inputBase}
                autoComplete="tel"
              />
            </label>

            <label className={fieldBox(regField === 'password')} onClick={() => { setRegField('password'); openNumpad('password'); passwordInputRef.current?.focus(); }}>
              <Lock className="w-5 h-5 text-white/50 shrink-0" />
              <input
                ref={passwordInputRef}
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                onFocus={() => { setRegField('password'); openNumpad('password'); }}
                onKeyDown={e => { if (e.key === 'Enter') handleRegister(); }}
                placeholder="Şifre"
                className={inputBase + ' text-2xl tracking-widest'}
                autoComplete="new-password"
              />
              <button
                type="button"
                onPointerDown={e => { e.preventDefault(); e.stopPropagation(); setShowPassword(s => !s); }}
                className="text-white/40 hover:text-white/70 transition shrink-0"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </label>

            {error && (
              <div className="bg-red-500/20 border border-red-500/40 text-red-300 px-4 py-3 rounded-xl text-sm">
                {error}
              </div>
            )}

            <button
              type="button"
              onClick={handleRegister}
              disabled={loading}
              className="w-full py-5 rounded-2xl text-white text-lg font-bold disabled:opacity-50 transition active:scale-[0.98] mt-2"
              style={{ background: primaryGrad, boxShadow: '0 8px 32px rgba(37,99,235,0.4)' }}
            >
              {loading ? 'Kaydediliyor...' : 'İşletmeyi Kaydet'}
            </button>
          </div>
        </div>

        {showNumpad && (
          <div className="w-80 flex flex-col justify-center px-6 py-10 border-l border-white/10">
            <div className="grid grid-cols-3 gap-3 mb-3">
              {numpadRows.map((row) =>
                row.map((k) => (
                  <NumpadKey key={k.d} label={k.d} sub={k.s} onPress={() => handleNumpadPress(k.d)} />
                ))
              )}
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div />
              <NumpadKey label="0" onPress={() => handleNumpadPress('0')} />
              <NumpadBackspace onPress={handleNumpadDelete} />
            </div>
            <button
              type="button"
              onClick={() => setShowNumpad(false)}
              className="mt-6 w-full py-4 rounded-2xl text-white/60 text-sm font-medium hover:text-white transition border border-white/10 hover:border-white/20"
            >
              Kapat
            </button>
          </div>
        )}
      </div>
    );
  }

  const sqlMode = currentDbMode === 'sqlserver' || currentDbMode === 'postgres' || isSqlServerMode();
  const localMode = currentDbMode === 'local' || isLocalMode();
  const offlineMode = sqlMode || localMode;

  return (
    <div className="min-h-screen flex" style={{ background: bg }}>
      <div className="flex-1 flex flex-col items-center justify-center px-10 py-12">

        {onSwitchMode && step === 'phone' && (
          <div className="absolute top-6 right-6">
            <button
              type="button"
              onClick={onSwitchMode}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-white/15 bg-white/10 hover:bg-white/15 transition text-white/70 hover:text-white text-xs font-semibold"
            >
              <Settings className="w-3.5 h-3.5" />
              Bağlantı ayarı
            </button>
          </div>
        )}

        <img src={logoSrc} alt="ŞefPOS" className="h-16 w-auto mb-6 brightness-0 invert drop-shadow-2xl" />

        {step === 'phone' && (
          <div className="flex items-center gap-2 mb-8">
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border ${
              sqlMode
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : localMode
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                  : 'bg-blue-500/10 border-blue-500/30 text-blue-400'
            }`}>
              {sqlMode ? <Server className="w-3.5 h-3.5" /> : localMode ? <HardDrive className="w-3.5 h-3.5" /> : <Cloud className="w-3.5 h-3.5" />}
              {sqlMode ? 'PostgreSQL Modu' : localMode ? 'Yerel Mod' : 'Bulut Modu'}
            </div>
          </div>
        )}

        {step === 'phone' ? (
          <>
            <h1 className="text-white text-4xl font-bold mb-2 text-center">Hoş Geldiniz</h1>
            <p className="text-white/50 text-lg mb-10 text-center">
              {offlineMode ? 'Kullanıcı adınızı girin' : 'Telefon numaranızı girin'}
            </p>

            <div className="w-full max-w-sm">
              {offlineMode ? (
                <div className={fieldBox(false) + ' mb-3'}>
                  <User className="w-6 h-6 text-white/50 shrink-0" />
                  <input
                    ref={loginInputRef}
                    type="text"
                    value={loginValue}
                    onChange={e => setLoginValue(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleLogin(); }}
                    placeholder={localMode ? 'Kullanıcı adı veya e-posta' : 'Kullanıcı adı veya e-posta'}
                    className={inputBase}
                    autoComplete="username"
                    autoFocus
                  />
                </div>
              ) : (
                <label
                  className={fieldBox(showNumpad && numpadTarget === 'login') + ' mb-3'}
                  onClick={() => { openNumpad('login'); loginInputRef.current?.focus(); }}
                >
                  <Phone className="w-6 h-6 text-white/50 shrink-0" />
                  <input
                    ref={loginInputRef}
                    type="text"
                    value={loginValue}
                    onChange={handleLoginChange}
                    onFocus={() => openNumpad('login')}
                    onKeyDown={handlePhoneKeyDown}
                    placeholder="Telefon numarası veya kullanıcı adı"
                    className={inputBase}
                    autoComplete="username"
                    autoFocus
                  />
                </label>
              )}

              <div className="flex items-center gap-3 mb-10 px-1">
                <button
                  type="button"
                  onClick={() => setRemember(r => !r)}
                  className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition shrink-0 ${remember ? 'border-blue-500 bg-blue-500' : 'border-white/30'}`}
                >
                  {remember && (
                    <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 12 12">
                      <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
                <span onClick={() => setRemember(r => !r)} className="text-white/50 text-base select-none cursor-pointer">
                  Beni hatırla
                </span>
              </div>

              {error && (
                <div className="bg-red-500/20 border border-red-500/40 text-red-300 px-5 py-4 rounded-2xl text-sm mb-4">
                  {error}
                </div>
              )}

              <button
                type="button"
                onClick={handleLogin}
                disabled={loading || !loginValue.trim()}
                className="w-full py-6 rounded-3xl text-white text-xl font-bold disabled:opacity-40 transition active:scale-[0.98] mb-4"
                style={{ background: primaryGrad, boxShadow: '0 8px 32px rgba(37,99,235,0.4)' }}
              >
                Devam Et
              </button>

              {!sqlMode && (
                <button
                  type="button"
                  onClick={() => { setView('register'); setError(''); }}
                  className="w-full py-5 rounded-3xl border-2 border-white/10 text-white/60 text-base font-medium hover:text-white hover:border-white/20 transition mb-6"
                >
                  {localMode ? 'İlk Kurulum / Yeni İşletme' : 'Yeni İşletme Kaydı'}
                </button>
              )}

              <div className="flex items-center gap-3 mb-4">
                <div className="flex-1 h-px bg-white/10" />
                <span className="text-white/30 text-sm">veya</span>
                <div className="flex-1 h-px bg-white/10" />
              </div>

              <button
                type="button"
                onClick={() => {
                  if (onCourierMode) {
                    onCourierMode();
                  } else {
                    const url = new URL(window.location.href);
                    url.searchParams.set('courier', '1');
                    window.location.href = url.toString();
                  }
                }}
                className="w-full py-5 rounded-3xl border-2 border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 font-semibold text-base flex items-center justify-center gap-3 transition"
              >
                <Bike className="w-5 h-5" />
                Kurye Girişi
              </button>
            </div>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => { setStep('phone'); setError(''); setIsSuspended(false); }}
              className="absolute top-8 left-8 flex items-center gap-2 text-white/60 hover:text-white transition text-base font-medium"
            >
              <ChevronLeft className="w-5 h-5" />
              Geri
            </button>

            <h1 className="text-white text-4xl font-bold mb-2 text-center">Şifre</h1>
            <p className="text-white/50 text-lg mb-3 text-center">{loginValue}</p>
            <p className="text-white/30 text-sm mb-10 text-center">Şifrenizi girin</p>

            <div className="w-full max-w-sm">
              {offlineMode ? (
                <div className={fieldBox(false) + ' mb-10'}>
                  <Lock className="w-6 h-6 text-white/50 shrink-0" />
                  <input
                    ref={passwordInputRef}
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleLogin(); }}
                    placeholder="Şifre"
                    className={inputBase}
                    autoComplete="current-password"
                    autoFocus
                  />
                  <button
                    type="button"
                    onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); setShowPassword(s => !s); }}
                    className="text-white/40 hover:text-white/70 transition shrink-0"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              ) : (
                <label
                  className={fieldBox(showNumpad && numpadTarget === 'password') + ' mb-10'}
                  onClick={() => { openNumpad('password'); passwordInputRef.current?.focus(); }}
                >
                  <Lock className="w-6 h-6 text-white/50 shrink-0" />
                  <input
                    ref={passwordInputRef}
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    onFocus={() => openNumpad('password')}
                    onKeyDown={handlePasswordKeyDown}
                    placeholder="Şifre"
                    className={inputBase + ' text-2xl tracking-widest'}
                    autoComplete="current-password"
                    autoFocus
                  />
                  <button
                    type="button"
                    onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); setShowPassword(s => !s); }}
                    className="text-white/40 hover:text-white/70 transition shrink-0"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </label>
              )}

              {error && !isSuspended && (
                <div className="bg-red-500/20 border border-red-500/40 text-red-300 px-5 py-4 rounded-2xl text-sm mb-4">
                  {error}
                </div>
              )}
              {isSuspended && (
                <div className="bg-red-500/20 border border-red-500/40 rounded-2xl px-5 py-4 mb-4">
                  <p className="text-red-300 font-bold text-sm mb-1">Hesap Askıya Alındı</p>
                  <p className="text-red-400 text-sm">{error}</p>
                  <p className="text-red-500/70 text-xs mt-1">Destek: 0544 244 90 80</p>
                </div>
              )}

              <button
                type="button"
                onClick={handleLogin}
                disabled={loading || !password}
                className="w-full py-6 rounded-3xl text-white text-xl font-bold disabled:opacity-40 transition active:scale-[0.98]"
                style={{ background: primaryGrad, boxShadow: '0 8px 32px rgba(37,99,235,0.4)' }}
              >
                {loading ? 'Giriş yapılıyor...' : 'Giriş Yap'}
              </button>
            </div>
          </>
        )}
      </div>

      {showNumpad && (
        <div className="w-80 flex flex-col justify-center px-6 py-10 border-l border-white/10">
          <p className="text-white/40 text-sm text-center mb-6 uppercase tracking-widest font-medium">
            {numpadTarget === 'password' ? 'Şifre' : 'Numara'}
          </p>
          <div className="grid grid-cols-3 gap-3 mb-3">
            {numpadRows.map((row) =>
              row.map((k) => (
                <NumpadKey key={k.d} label={k.d} sub={k.s} onPress={() => handleNumpadPress(k.d)} />
              ))
            )}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div />
            <NumpadKey label="0" onPress={() => handleNumpadPress('0')} />
            <NumpadBackspace onPress={handleNumpadDelete} />
          </div>
          <button
            type="button"
            onClick={() => {
              setShowNumpad(false);
              if (step === 'phone' && numpadTarget === 'login' && loginValue.trim()) {
                setStep('password');
              }
            }}
            className="mt-6 w-full py-5 rounded-2xl text-white text-base font-semibold transition border border-white/10 hover:border-white/20 hover:bg-white/5"
          >
            Tamam
          </button>
        </div>
      )}
    </div>
  );
}
