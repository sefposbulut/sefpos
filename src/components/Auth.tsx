import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Bike, Lock, Building2, Phone, ArrowRight, Sparkles, ChefHat } from 'lucide-react';
import { WaiterLogin } from './WaiterLogin';

function phoneToEmail(phone: string) {
  const cleaned = phone.replace(/\D/g, '');
  return `${cleaned}@shefpos.local`;
}

const REMEMBER_KEY = 'shefpos_remembered_login';
const REMEMBER_PASSWORD_KEY = 'shefpos_remembered_password';

const formatPhone = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 4) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 4)} ${digits.slice(4)}`;
  if (digits.length <= 9) return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
  return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7, 9)} ${digits.slice(9)}`;
};

const isPhoneInput = (val: string) => /^\d[\d\s]*$/.test(val.trim());

export function Auth() {
  const [authMode, setAuthMode] = useState<'main' | 'waiter'>('main');
  const [isLogin, setIsLogin] = useState(true);
  const [loginValue, setLoginValue] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [fullName, setFullName] = useState('');
  const [tenantName, setTenantName] = useState('');
  const [error, setError] = useState('');
  const [isSuspended, setIsSuspended] = useState(false);
  const [loading, setLoading] = useState(false);
  const { signIn, signUp } = useAuth();

  useEffect(() => {
    const savedLogin = localStorage.getItem(REMEMBER_KEY);
    const savedPassword = localStorage.getItem(REMEMBER_PASSWORD_KEY);
    if (savedLogin) {
      setLoginValue(savedLogin);
      setRemember(true);
    }
    if (savedPassword) {
      setPassword(savedPassword);
    }
  }, []);

  const resolveEmail = async (val: string): Promise<string | null> => {
    const trimmed = val.trim();
    if (isPhoneInput(trimmed)) return phoneToEmail(trimmed.replace(/\D/g, ''));
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

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError('');
    if (!loginValue.trim()) {
      setError('Telefon numarası veya kullanıcı adı girin');
      return;
    }
    setLoading(true);
    try {
      if (isLogin) {
        const email = await resolveEmail(loginValue);
        if (!email) {
          setError('Kullanıcı bulunamadı');
          setLoading(false);
          return;
        }
        const result = await signIn(email, password);
        if (result.error) {
          if ((result as any).suspended) {
            setIsSuspended(true);
            setError(result.error.message);
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
      } else {
        if (!fullName || !tenantName) {
          setError('Lütfen tüm alanları doldurun');
          setLoading(false);
          return;
        }
        const cleaned = loginValue.replace(/\D/g, '');
        if (cleaned.length < 10) {
          setError('Geçerli bir telefon numarası girin');
          setLoading(false);
          return;
        }
        const email = phoneToEmail(cleaned);
        const { error } = await signUp(email, password, fullName, tenantName);
        if (error) throw error;
        if (remember) {
          localStorage.setItem(REMEMBER_KEY, loginValue);
          localStorage.setItem(REMEMBER_PASSWORD_KEY, password);
        }
      }
    } catch (err: any) {
      const msg = err.message || '';
      if (msg.includes('Invalid login credentials'))
        setError('Kullanıcı adı/telefon veya şifre hatalı');
      else if (msg.includes('User already registered'))
        setError('Bu telefon numarası zaten kayıtlı');
      else setError(msg || 'Bir hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  if (authMode === 'waiter') {
    return (
      <WaiterLogin
        onLoginSuccess={(waiter) => {
          window.location.href = `/?waiter=${waiter.id}&tenant=${waiter.tenant_id}`;
        }}
        onBack={() => setAuthMode('main')}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col overflow-hidden relative">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 -left-40 w-80 h-80 bg-orange-600/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 -right-40 w-80 h-80 bg-orange-500/10 rounded-full blur-3xl" />
      </div>

      {/* Header */}
      <div className="relative z-10 border-b border-slate-700/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">ŞefPOS</h1>
              <p className="text-xs text-slate-400">Profesyonel Restoran Yönetim Sistemi</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="relative z-10 flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md">
          {isLogin ? (
            // Login Form
            <>
              <div className="mb-8 text-center">
                <h2 className="text-3xl font-bold text-white mb-2">Hoş Geldiniz</h2>
                <p className="text-slate-400">Restoranınızı yönetmeye başlayın</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4 mb-8">
                <div className="relative group">
                  <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within:text-orange-500 transition-colors" />
                  <input
                    type="text"
                    value={loginValue}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (isPhoneInput(val) || val === '') setLoginValue(formatPhone(val));
                      else setLoginValue(val);
                    }}
                    placeholder="Telefon numarası veya kullanıcı adı"
                    autoComplete="username"
                    className="w-full pl-12 pr-4 py-3 bg-slate-800/50 border border-slate-700 hover:border-slate-600 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 rounded-lg outline-none text-white text-sm transition-all placeholder:text-slate-500"
                  />
                </div>

                <div className="relative group">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within:text-orange-500 transition-colors" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Şifre"
                    autoComplete="current-password"
                    className="w-full pl-12 pr-4 py-3 bg-slate-800/50 border border-slate-700 hover:border-slate-600 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 rounded-lg outline-none text-white text-sm transition-all placeholder:text-slate-500"
                  />
                </div>

                <div className="flex items-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => setRemember((r) => !r)}
                    className={`w-5 h-5 rounded border flex items-center justify-center transition shrink-0 ${
                      remember ? 'border-orange-500 bg-orange-500' : 'border-slate-600 bg-slate-800'
                    }`}
                  >
                    {remember && (
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 12 12">
                        <path
                          d="M2 6l3 3 5-5"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </button>
                  <label onClick={() => setRemember((r) => !r)} className="text-sm text-slate-400 select-none cursor-pointer hover:text-slate-300 transition-colors">
                    Beni hatırla
                  </label>
                </div>

                {error && !isSuspended && (
                  <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-sm">
                    {error}
                  </div>
                )}

                {isSuspended && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
                    <p className="font-bold text-red-400 mb-1 text-sm">Hesap Askıya Alındı</p>
                    <p className="text-red-400 text-xs mb-2">{error}</p>
                    <p className="text-red-500 text-xs font-medium">Destek: 0544 244 90 80</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-700 hover:to-orange-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-lg text-sm transition-all duration-200 flex items-center justify-center gap-2 mt-6"
                >
                  {loading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-orange-200 border-t-white rounded-full animate-spin" />
                      Giriş yapılıyor...
                    </>
                  ) : (
                    <>
                      Giriş Yap
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>

              <div className="relative mb-8">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full h-px bg-gradient-to-r from-transparent via-slate-700 to-transparent" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-slate-900 text-slate-400">yeni işletme</span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setIsLogin(false);
                  setError('');
                }}
                className="w-full py-3 border border-orange-500/50 hover:border-orange-500 text-orange-400 hover:text-orange-300 font-semibold rounded-lg text-sm transition-all hover:bg-orange-500/5"
              >
                Yeni Hesap Oluştur
              </button>

              <div className="relative my-8">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full h-px bg-gradient-to-r from-transparent via-slate-700 to-transparent" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-slate-900 text-slate-400">diğer giriş seçenekleri</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setAuthMode('waiter')}
                  className="flex flex-col items-center justify-center gap-3 py-6 px-4 border border-slate-700 hover:border-orange-500 rounded-lg bg-slate-800/30 hover:bg-slate-800/50 transition-all group"
                >
                  <ChefHat className="w-8 h-8 text-orange-500 group-hover:scale-110 transition-transform" />
                  <span className="text-sm font-semibold text-white">Garson</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const url = new URL(window.location.href);
                    url.searchParams.set('courier', '1');
                    window.location.href = url.toString();
                  }}
                  className="flex flex-col items-center justify-center gap-3 py-6 px-4 border border-slate-700 hover:border-orange-500 rounded-lg bg-slate-800/30 hover:bg-slate-800/50 transition-all group"
                >
                  <Bike className="w-8 h-8 text-orange-500 group-hover:scale-110 transition-transform" />
                  <span className="text-sm font-semibold text-white">Kurye</span>
                </button>
              </div>
            </>
          ) : (
            // Register Form
            <>
              <div className="mb-8 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setIsLogin(true);
                    setError('');
                  }}
                  className="text-orange-500 text-sm font-semibold mb-4 flex items-center gap-1 hover:text-orange-400 transition-colors mx-auto"
                >
                  ← Geri Dön
                </button>
                <h2 className="text-3xl font-bold text-white mb-2">Başlayın</h2>
                <p className="text-slate-400">Restoranınızı ŞefPOS'a kaydettirin</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4 mb-8">
                <div className="relative group">
                  <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within:text-orange-500 transition-colors" />
                  <input
                    type="text"
                    value={tenantName}
                    onChange={(e) => setTenantName(e.target.value)}
                    placeholder="Restoran / İşletme Adı"
                    className="w-full pl-12 pr-4 py-3 bg-slate-800/50 border border-slate-700 hover:border-slate-600 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 rounded-lg outline-none text-white text-sm transition-all placeholder:text-slate-500"
                  />
                </div>

                <div className="relative group">
                  <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within:text-orange-500 transition-colors" />
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Ad Soyad"
                    className="w-full pl-12 pr-4 py-3 bg-slate-800/50 border border-slate-700 hover:border-slate-600 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 rounded-lg outline-none text-white text-sm transition-all placeholder:text-slate-500"
                  />
                </div>

                <div className="relative group">
                  <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within:text-orange-500 transition-colors" />
                  <input
                    type="tel"
                    value={loginValue}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (isPhoneInput(val) || val === '') setLoginValue(formatPhone(val));
                      else setLoginValue(val);
                    }}
                    placeholder="Telefon Numarası"
                    className="w-full pl-12 pr-4 py-3 bg-slate-800/50 border border-slate-700 hover:border-slate-600 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 rounded-lg outline-none text-white text-sm transition-all placeholder:text-slate-500"
                  />
                </div>

                <div className="relative group">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within:text-orange-500 transition-colors" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Şifre"
                    className="w-full pl-12 pr-4 py-3 bg-slate-800/50 border border-slate-700 hover:border-slate-600 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 rounded-lg outline-none text-white text-sm transition-all placeholder:text-slate-500"
                  />
                </div>

                {error && (
                  <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-sm">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-700 hover:to-orange-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-lg text-sm transition-all duration-200 flex items-center justify-center gap-2 mt-6"
                >
                  {loading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-orange-200 border-t-white rounded-full animate-spin" />
                      Kaydediliyor...
                    </>
                  ) : (
                    <>
                      Kayıt Ol
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>

              <p className="text-center text-sm text-slate-400">
                Zaten hesabınız var mı?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setIsLogin(true);
                    setError('');
                  }}
                  className="text-orange-500 font-semibold hover:text-orange-400 transition-colors"
                >
                  Giriş yapın
                </button>
              </p>
            </>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="relative z-10 border-t border-slate-700/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 text-center text-sm text-slate-500">
          <p>© 2026 ŞefPOS. Tüm hakları saklıdır.</p>
        </div>
      </div>
    </div>
  );
}
