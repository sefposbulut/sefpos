import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase, invokeEdgeFunction } from '../lib/supabase';
import { normalizeTurkishMobileDigits, pinToAuthPassword } from '../lib/phoneAuthEmail';
import { resolveLoginIdentifier } from '../lib/panelUserLoginResolve';
import { isCapacitorNative } from '../lib/capacitorPlatform';
import { Bike, Lock, Building2, Phone, ArrowRight, Sparkles, ChefHat, User, Mail, ShieldCheck, BarChart3, Wifi, Smartphone, Printer, CreditCard } from 'lucide-react';
import { isAykaAdminPath, AYKA_ADMIN_PATH } from '../lib/aykaRoute';
import { WaiterLogin } from './WaiterLogin';
import { publicAsset } from '../lib/assetUrl';

function getInitialAuthMode(): 'main' | 'waiter' {
  if (typeof window === 'undefined') return 'main';
  if (isAykaAdminPath(window.location.pathname)) return 'main';
  const sp = new URLSearchParams(window.location.search);
  if (sp.has('waiter') || sp.has('garson')) return 'waiter';
  if (isCapacitorNative()) return 'waiter';
  return 'main';
}

const REMEMBER_KEY = 'shefpos_remembered_login';
const REMEMBER_PASSWORD_KEY = 'shefpos_remembered_password';
const ADMIN_LOGIN_EMAIL = 'info@aykasoft.com.tr';
const ADMIN_LOGIN_EMAIL_LEGACY = 'infop@aykasoft.com.tr';
const TEST_LOGIN_EMAIL = 'info@sefpos.com.tr';
const TEST_LOGIN_PHONE = '02363131818';
const ADMIN_DEFAULT_PASSWORD = '2128948++';
const AYKA_AUTH_KEY = 'shefpos_ayka_auth';

const formatPhone = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 4) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 4)} ${digits.slice(4)}`;
  if (digits.length <= 9) return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
  return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7, 9)} ${digits.slice(9)}`;
};

const isPhoneInput = (val: string) => /^\d[\d\s]*$/.test(val.trim());
const isValidEmail = (val: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.trim());

type RegisterFieldKey = 'tenantName' | 'fullName' | 'registerEmail' | 'phone' | 'password' | 'otp';

const REGISTER_FIELD_RING_ERROR =
  'border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-500/25';
const REGISTER_FIELD_RING_OK =
  'border-slate-700 hover:border-slate-600 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20';

interface AuthProps {
  /** /login sayfasından landing’e dönmek için handler. Verilmezse Ana sayfa linki window.location’a düşer. */
  onBackToLanding?: () => void;
}

export function Auth({ onBackToLanding }: AuthProps = {}) {
  const isAykaPath = isAykaAdminPath(window.location.pathname);
  const [authMode, setAuthMode] = useState<'main' | 'waiter'>(getInitialAuthMode);
  const [isLogin, setIsLogin] = useState(true);
  const [loginValue, setLoginValue] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [fullName, setFullName] = useState('');
  const [tenantName, setTenantName] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [isSuspended, setIsSuspended] = useState(false);
  const [loading, setLoading] = useState(false);
  const [otpRequested, setOtpRequested] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpPhone, setOtpPhone] = useState('');
  const [otpToken, setOtpToken] = useState('');
  const [registerErrors, setRegisterErrors] = useState<Partial<Record<RegisterFieldKey, string>>>({});
  /** 1 = yalnızca cep + SMS; 2 = firma, ad soyad, e-posta, şifre */
  const [registerWizardStep, setRegisterWizardStep] = useState<1 | 2>(1);
  /** Supabase rate-limit (429) sonrasi geri sayim — kullanici butonu spamlemesin diye */
  const [signupCooldown, setSignupCooldown] = useState(0);
  const { signIn, signUp } = useAuth();

  useEffect(() => {
    if (signupCooldown <= 0) return;
    const t = window.setInterval(() => setSignupCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearInterval(t);
  }, [signupCooldown]);

  const registerFieldRing = (key: RegisterFieldKey) =>
    registerErrors[key] ? REGISTER_FIELD_RING_ERROR : REGISTER_FIELD_RING_OK;

  const resetRegisterWizard = () => {
    setRegisterWizardStep(1);
    setRegisterErrors({});
    setTenantName('');
    setFullName('');
    setRegisterEmail('');
    setOtpRequested(false);
    setOtpVerified(false);
    setOtpCode('');
    setOtpPhone('');
    setOtpToken('');
    setInfo('');
  };

  const sendOtp = async () => {
    setError('');
    setInfo('');
    setRegisterErrors({});
    const cleaned = loginValue.replace(/\D/g, '');
    const nextErr: Partial<Record<RegisterFieldKey, string>> = {};
    if (cleaned.length < 10) nextErr.phone = 'Zorunlu alan';
    if (Object.keys(nextErr).length > 0) {
      setRegisterErrors(nextErr);
      setError('Lütfen cep telefonu girin');
      return;
    }
    if (cleaned === TEST_LOGIN_PHONE) {
      setOtpPhone(cleaned);
      setOtpRequested(true);
      setOtpVerified(true);
      setOtpToken('test-bypass');
      setInfo('Test hesabı için SMS doğrulama atlandı.');
      return;
    }
    const norm = normalizeTurkishMobileDigits(cleaned);
    if (norm.length !== 10 || !norm.startsWith('5')) {
      setRegisterErrors({ phone: 'Geçerli cep telefonu girin (05XXXXXXXXX)' });
      setError('Geçerli bir cep telefonu girin (05XXXXXXXXX)');
      return;
    }
    setLoading(true);
    try {
      const data = await invokeEdgeFunction<{ success: boolean; otpToken?: string }>('send-sms-otp', {
        phone: norm,
        purpose: 'signup',
      });
      if (!data?.otpToken) {
        throw new Error('OTP token üretilemedi');
      }
      setOtpPhone(norm);
      setOtpRequested(true);
      setOtpVerified(false);
      setOtpToken(data.otpToken);
      setRegisterErrors({});
      setInfo('SMS kodu gönderildi. 4 dakika içinde doğrulayın.');
    } catch (err: any) {
      setError(err?.message || 'SMS doğrulama kodu gönderilemedi');
    } finally {
      setLoading(false);
    }
  };

  /** Adım 1 bitti: SMS kodu doğrulandıktan sonra firma/ad/e-posta ekranına geç. */
  const advanceToRegisterBusinessStep = async () => {
    setError('');
    setRegisterErrors({});
    const cleaned = loginValue.replace(/\D/g, '');
    if (cleaned.length < 10) {
      setRegisterErrors({ phone: 'Zorunlu alan' });
      setError('Cep telefonu zorunludur');
      return;
    }
    const registerNorm = normalizeTurkishMobileDigits(cleaned);
    if (!otpRequested || otpPhone !== registerNorm) {
      setRegisterErrors({ phone: 'Önce SMS kodu gönderin' });
      setError('Önce telefonunuza doğrulama kodu gönderin');
      return;
    }
    if (otpVerified) {
      setRegisterWizardStep(2);
      setInfo('İşletme bilgilerinizi girin.');
      return;
    }
    if (!otpCode.trim() || otpCode.trim().length < 4) {
      setRegisterErrors({ otp: 'Zorunlu alan' });
      setError('SMS doğrulama kodunu girin');
      return;
    }
    setLoading(true);
    try {
      const data = await invokeEdgeFunction<{ success: boolean }>('verify-sms-otp', {
        phone: registerNorm,
        code: otpCode.trim(),
        purpose: 'signup',
        otpToken,
      });
      if (!data?.success) throw new Error('SMS kodu doğrulanamadı');
      setOtpVerified(true);
      setRegisterWizardStep(2);
      setInfo('Telefon doğrulandı. İşletme bilgilerinizi girin.');
    } catch (err: any) {
      setError(err?.message || 'Kod doğrulanamadı');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isLogin || registerWizardStep !== 1) return;
    const cleaned = loginValue.replace(/\D/g, '');
    const norm = normalizeTurkishMobileDigits(cleaned);
    if (!norm || norm !== otpPhone) {
      setOtpRequested(false);
      setOtpVerified(false);
      setOtpCode('');
      setOtpToken('');
      setInfo('');
    }
  }, [loginValue, isLogin, otpPhone, registerWizardStep]);

  useEffect(() => {
    if (!isAykaPath) return;
    setIsLogin(true);
    setLoginValue(ADMIN_LOGIN_EMAIL);
    if (!password) setPassword(ADMIN_DEFAULT_PASSWORD);
  }, [isAykaPath, password]);

  useEffect(() => {
    if (isAykaPath) return;
    const savedLogin = localStorage.getItem(REMEMBER_KEY);
    const savedPassword = localStorage.getItem(REMEMBER_PASSWORD_KEY);
    if (savedLogin) {
      setLoginValue(savedLogin);
      setRemember(true);
    }
    if (savedPassword) {
      setPassword(savedPassword);
    }
  }, [isAykaPath]);

  /**
   * Electron masaüstüsünde **kayıtlı kullanıcı adı yoksa** Beni Hatırla
   * checkbox'ını varsayılan olarak işaretli getir. Böylece ilk girişte
   * personel şifresini yazıp Enter'a bastığında bir sonraki açılışta
   * kullanıcı adı (ve şifre, kullanıcı tercihine göre) otomatik dolar ve
   * tekrar uğraşılmaz. Web'de davranış aynı kalır.
   */
  useEffect(() => {
    if (isAykaPath) return;
    const isElectronApp = typeof window !== 'undefined' && !!(window as any).electronAPI;
    if (!isElectronApp) return;
    const savedLogin = (() => {
      try { return localStorage.getItem(REMEMBER_KEY) || ''; } catch { return ''; }
    })();
    if (!savedLogin) {
      setRemember(true);
    }
  }, [isAykaPath]);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError('');
    setInfo('');
    if (!loginValue.trim()) {
      setError('Telefon numarası veya kullanıcı adı girin');
      return;
    }
    setLoading(true);
    try {
      if (isLogin) {
        const trimmed = loginValue.trim().toLowerCase();

        if (isAykaPath) {
          if (!trimmed || !password.trim()) {
            setError('Eposta girin');
            setLoading(false);
            return;
          }

          let result = await signIn(trimmed, password);
          if (
            (trimmed === ADMIN_LOGIN_EMAIL || trimmed === ADMIN_LOGIN_EMAIL_LEGACY) &&
            result.error?.message?.includes('Invalid login credentials')
          ) {
            const fallbackEmail = trimmed === ADMIN_LOGIN_EMAIL ? ADMIN_LOGIN_EMAIL_LEGACY : ADMIN_LOGIN_EMAIL;
            result = await signIn(fallbackEmail, password);
          }
          if (result.error) {
            throw result.error;
          }

          if (trimmed === ADMIN_LOGIN_EMAIL || trimmed === ADMIN_LOGIN_EMAIL_LEGACY || trimmed === TEST_LOGIN_EMAIL) {
            const { data: authData } = await supabase.auth.getUser();
            const uid = authData?.user?.id;
            let promoteError: any = null;
            if (uid) {
              const res = await supabase
                .from('profiles')
                .update({ is_super_admin: true })
                .eq('id', uid);
              promoteError = res.error || null;
            }
            if (promoteError) {
              const fallback = await supabase
                .from('profiles')
                .update({ is_super_admin: true })
                .eq('email', trimmed);
              promoteError = fallback.error || null;
            }
            if (promoteError) {
              setError('Lisans paneli yetkisi verilemedi. Lütfen admin profil yetkisini kontrol edin.');
              setLoading(false);
              return;
            }

            if (uid) {
              const check = await supabase
                .from('profiles')
                .select('is_super_admin')
                .eq('id', uid)
                .maybeSingle();
              if (check.error || !check.data?.is_super_admin) {
                setError('Bu hesapta super admin yetkisi yok. Eski restoranlari gormek icin super admin hesabi ile girin.');
                setLoading(false);
                return;
              }
            }
          }

          localStorage.setItem(AYKA_AUTH_KEY, '1');
          window.location.assign(AYKA_ADMIN_PATH);
          return;
        }

        let email: string;
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
        let result = await signIn(email, password);
        if (
          (trimmed === ADMIN_LOGIN_EMAIL || trimmed === ADMIN_LOGIN_EMAIL_LEGACY) &&
          result.error?.message?.includes('Invalid login credentials')
        ) {
          const fallbackEmail = email === ADMIN_LOGIN_EMAIL ? ADMIN_LOGIN_EMAIL_LEGACY : ADMIN_LOGIN_EMAIL;
          result = await signIn(fallbackEmail, password);
        }

        // PIN ile yaratılan garson/kasiyer kullanıcıları için: kullanıcı 4-6 haneli
        // sayısal şifre girdiyse, sentetik `sefp_<pin>` formatına dönüştürüp bir kez
        // daha dene. Kullanıcı UX: "PIN'imle giriş yapayım" diyebilsin.
        if (result.error?.message?.includes('Invalid login credentials')) {
          const digits = password.replace(/\D/g, '');
          if (digits.length >= 4 && digits.length <= 6 && digits === password.trim()) {
            try {
              const pinPwd = pinToAuthPassword(digits);
              const pinResult = await signIn(email, pinPwd);
              if (!pinResult.error) result = pinResult;
            } catch {
              /* sessizce yut, orijinal hatayı bırak */
            }
          }
        }
        if (result.error) {
          if ((result as any).suspended) {
            setIsSuspended(true);
            setError(result.error.message);
            setLoading(false);
            return;
          }
          throw result.error;
        }

        // Eskiden waiter/courier rolü panele girince signOut'a düşürülüyordu.
        // Kullanıcı talebi: panelden username + şifre yazınca her rolün giriş
        // yapabilmesi. Yetkilendirme RLS politikalarıyla DB tarafında zaten
        // sınırlanır; UI yine yetkili olduğu sayfaları gösterir.
        // (Waiter PIN akışı için "Garson" butonu hâlâ ayrı çalışmaya devam eder.)

        // Electron'da: kullanici adi/eposta her zaman saklanir — restoran
        // personeli her acilista yeniden yazmak zorunda kalmasin. Sifre yine
        // sadece `remember` (Beni Hatirla) acikken kaydedilir; paylasili kasada
        // duz metin sifre sizmasin.
        const isElectronApp = typeof window !== 'undefined' && !!(window as any).electronAPI;
        if (remember || isElectronApp) {
          try { localStorage.setItem(REMEMBER_KEY, loginValue); } catch {}
        } else {
          try { localStorage.removeItem(REMEMBER_KEY); } catch {}
        }
        if (remember) {
          try { localStorage.setItem(REMEMBER_PASSWORD_KEY, password); } catch {}
        } else {
          try { localStorage.removeItem(REMEMBER_PASSWORD_KEY); } catch {}
        }
      } else {
        setRegisterErrors({});
        const nextErr: Partial<Record<RegisterFieldKey, string>> = {};
        if (!tenantName.trim()) nextErr.tenantName = 'Zorunlu alan';
        if (!fullName.trim()) nextErr.fullName = 'Zorunlu alan';
        if (!registerEmail.trim()) nextErr.registerEmail = 'Zorunlu alan';
        else if (!isValidEmail(registerEmail)) nextErr.registerEmail = 'Geçerli bir e-posta girin';
        if (!password.trim()) nextErr.password = 'Zorunlu alan';
        const cleaned = loginValue.replace(/\D/g, '');
        if (cleaned.length < 10) nextErr.phone = 'Zorunlu alan';
        if (Object.keys(nextErr).length > 0) {
          setRegisterErrors(nextErr);
          setError('Lütfen zorunlu alanları doldurun');
          setLoading(false);
          return;
        }
        const registerNorm = normalizeTurkishMobileDigits(cleaned);
        if (registerWizardStep !== 2) {
          setError('Önce telefon doğrulamasını tamamlayın');
          setLoading(false);
          return;
        }
        if (!otpRequested || otpPhone !== registerNorm || !otpVerified) {
          setRegisterErrors((prev) => ({ ...prev, phone: 'Önce telefon doğrulaması yapın' }));
          setError('Önce telefon numaranızı doğrulayın');
          setLoading(false);
          return;
        }

        // Müşteri kaydında Auth e-postası olarak girdiği gerçek iletişim e-postası
        // kullanılır. Telefon raw_user_meta_data ile gönderilip handle_new_user
        // trigger'ı tarafından profiles.phone'a yazılır. Boylece panel girişinde
        // telefonla login (panelUserLoginResolve) bu profiles.phone uzerinden
        // gerçek email'i bulup oturum açar — sentetik @sefpos.com.tr e-postasına
        // (MX olmayan domain → 400 invalid email) ihtiyaç kalmaz.
        const realEmail = registerEmail.trim().toLowerCase();
        const { error } = await signUp(
          realEmail,
          password,
          fullName,
          tenantName,
          realEmail,
          registerNorm,
        );
        if (error) throw error;
        try {
          sessionStorage.setItem('shefpos_phone_first_signup', '1');
        } catch {
          /* ignore */
        }
        await invokeEdgeFunction('send-sms-welcome', { phone: registerNorm });
        if (remember) {
          localStorage.setItem(REMEMBER_KEY, loginValue);
          localStorage.setItem(REMEMBER_PASSWORD_KEY, password);
        }
      }
    } catch (err: any) {
      const msg = String(err?.message || err || '');
      const low = msg.toLowerCase();
      if (msg.includes('Invalid login credentials'))
        setError('Kullanıcı adı/telefon veya şifre hatalı');
      else if (msg.includes('User already registered'))
        setError('Bu telefon numarası zaten kayıtlı');
      else if (
        low.includes('email address') && low.includes('invalid') ||
        low.includes('email_address_invalid') ||
        low.includes('email address.*is invalid')
      )
        setError(
          'Telefon numarasından üretilen e-posta Supabase tarafından geçersiz olarak işaretlendi. ' +
          'Domain\'in (varsayılan: sefpos.com.tr) MX kaydı olmadığı için reddediliyor. ' +
          'Çözüm: Cloudflare DNS panelinden MX kaydı ekleyin VEYA .env\'de VITE_PHONE_AUTH_EMAIL_DOMAIN ile MX\'i olan başka bir domain belirtin.',
        );
      else if (
        low.includes('rate limit') ||
        low.includes('too many requests') ||
        low.includes('over_email_send_rate_limit') ||
        low.includes('over_request_rate_limit') ||
        low.includes('email rate limit exceeded') ||
        msg.includes('429') ||
        /you can only request this after \d+/i.test(msg)
      ) {
        // Supabase 429 mesajinda cogu zaman "after X seconds" yazar — yakala, geri sayima koy.
        const m = msg.match(/after\s+(\d+)\s+(?:seconds|saniye|s\b)/i);
        const wait = m ? Math.min(900, parseInt(m[1], 10)) : 60;
        setSignupCooldown(wait);
        setError(
          `Onay e-postası / kayıt sınırına takıldınız (Supabase). ${wait} sn beklemeniz gerekiyor.\n` +
          `Kalıcı çözüm: Supabase Dashboard → Authentication → Providers → Email bölümünden ` +
          `"Confirm email" seçeneğini KAPATIN (telefon OTP zaten doğruluyor) ya da Custom SMTP bağlayın.`,
        );
      }
      else if (msg.includes('OTP'))
        setError('SMS doğrulama kodu geçersiz veya süresi doldu');
      else if (
        msg.includes('500') ||
        low.includes('internal server error') ||
        low.includes('database error') ||
        low.includes('querying schema')
      )
        setError(
          'Giriş sunucu hatası (Auth). Konsolda `[ŞefPOS] Supabase Auth HTTP` satırına bakın; Dashboard → Logs → Auth ve projede auth migration’larının uygulandığını kontrol edin.',
        );
      else setError(msg || 'Bir hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  if (authMode === 'waiter') {
    return (
      <WaiterLogin
        onLoginSuccess={() => {
          window.location.href = '/';
        }}
        onBack={() => setAuthMode('main')}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col overflow-hidden relative">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 -left-40 w-96 h-96 bg-orange-600/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 -right-40 w-96 h-96 bg-red-500/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/3 w-80 h-80 bg-amber-500/5 rounded-full blur-3xl" />
      </div>

      {/* Header */}
      <div className="relative z-10 border-b border-slate-700/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={publicAsset('logo.png')} alt="ŞefPOS" className="w-10 h-10 rounded-xl shadow-lg" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight">ŞefPOS</h1>
              <p className="text-[10px] md:text-xs text-slate-400">Restoran Yönetim Sistemi</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              if (onBackToLanding) onBackToLanding();
              else window.location.assign('/');
            }}
            className="text-xs md:text-sm text-slate-300 hover:text-white transition-colors px-3 py-1.5 rounded-lg hover:bg-slate-800/50"
          >
            ← Ana sayfa
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="relative z-10 flex-1 flex items-center justify-center px-4 py-6 md:py-8">
        <div className="w-full max-w-5xl">
          {isLogin ? (
            // ─── İki sütunlu giriş: Sol = form, Sağ = ŞefPOS özellik vitrini ───
            // lg (>=1024px) iki sütun açılır; mobilde sadece form (kompakt, ortalı).
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 lg:gap-6 items-stretch">

              {/* SOL — Giriş Formu */}
              <div className="bg-slate-900/70 border border-slate-700/70 rounded-2xl p-5 md:p-7 backdrop-blur-sm shadow-2xl flex flex-col w-full max-w-md mx-auto lg:max-w-none lg:mx-0">
                <div className="mb-5">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 mb-3 bg-orange-500/10 border border-orange-500/30 rounded-full">
                    <Sparkles className="w-3 h-3 text-orange-400" />
                    <span className="text-[10px] font-semibold text-orange-300 tracking-wide uppercase whitespace-nowrap">
                      Bulut + Yerel POS
                    </span>
                  </div>
                  <h2 className="text-2xl md:text-3xl font-bold text-white mb-1.5">Hoş Geldiniz</h2>
                  <p className="text-slate-400 text-sm">
                    E-posta, telefon veya kullanıcı adınızla giriş yapın.
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4 mb-5">
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
                    placeholder={
                      isAykaPath ? 'Admin eposta' : 'Telefon, e-posta veya kullanıcı adı (ör. turgutlu)'
                    }
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
                  className="w-full bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-700 hover:to-orange-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3.5 rounded-lg text-sm transition-all duration-200 flex items-center justify-center gap-2 mt-2"
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

                {!isAykaPath && (
                  <>
                    <div className="my-4 flex items-center gap-3">
                      <div className="flex-1 h-px bg-slate-700/70" />
                      <span className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
                        veya hızlı giriş
                      </span>
                      <div className="flex-1 h-px bg-slate-700/70" />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <button
                        type="button"
                        onClick={() => {
                          setIsLogin(false);
                          setError('');
                          resetRegisterWizard();
                          setLoginValue('');
                        }}
                        className="py-2.5 border border-orange-500/50 hover:border-orange-500 text-orange-400 hover:text-orange-300 font-semibold rounded-lg text-sm transition-all hover:bg-orange-500/5"
                      >
                        Yeni Hesap
                      </button>
                      <button
                        type="button"
                        onClick={() => setAuthMode('waiter')}
                        className="flex items-center justify-center gap-2 py-2.5 px-3 border border-slate-700 hover:border-orange-500 rounded-lg bg-slate-800/30 hover:bg-slate-800/50 transition-all group"
                      >
                        <ChefHat className="w-4 h-4 text-orange-500 group-hover:scale-110 transition-transform" />
                        <span className="text-sm font-semibold text-white">Garson</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const url = new URL(window.location.href);
                          url.searchParams.set('courier', '1');
                          window.location.href = url.toString();
                        }}
                        className="flex items-center justify-center gap-2 py-2.5 px-3 border border-slate-700 hover:border-orange-500 rounded-lg bg-slate-800/30 hover:bg-slate-800/50 transition-all group"
                      >
                        <Bike className="w-4 h-4 text-orange-500 group-hover:scale-110 transition-transform" />
                        <span className="text-sm font-semibold text-white">Kurye</span>
                      </button>
                    </div>
                  </>
                )}

                <p className="text-center text-xs text-slate-500 mt-5">
                  Sorun mu yaşıyorsunuz? <span className="text-orange-400 font-medium">0544 244 90 80</span>
                </p>
              </div>

              {/* SAĞ — Özellik vitrini (sadece lg+ ekranlarda) */}
              <div className="hidden lg:flex bg-gradient-to-br from-orange-500/10 via-slate-900/60 to-slate-900/80 border border-slate-700/70 rounded-2xl p-6 backdrop-blur-sm shadow-2xl flex-col justify-between overflow-hidden relative">
                <div className="absolute -right-20 -top-20 w-56 h-56 bg-orange-500/15 rounded-full blur-3xl pointer-events-none" />
                <div className="absolute -left-16 -bottom-16 w-64 h-64 bg-red-500/10 rounded-full blur-3xl pointer-events-none" />

                <div className="relative">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 mb-3 bg-white/5 border border-white/10 rounded-full">
                    <ShieldCheck className="w-3 h-3 text-emerald-400" />
                    <span className="text-[10px] font-semibold text-emerald-300 tracking-wide uppercase whitespace-nowrap">
                      Restoranların güvendiği POS
                    </span>
                  </div>
                  <h3 className="text-lg xl:text-xl font-bold text-white leading-snug mb-2">
                    Restoranınız için ihtiyaç duyduğunuz <span className="text-orange-400">her şey tek uygulamada</span>.
                  </h3>
                  <p className="text-slate-400 text-[13px] leading-relaxed mb-4">
                    Adisyon, mutfak yazıcısı, kasa, stok, kurye, online sipariş ve QR menü —
                    bulutta veya kendi sunucunuzda.
                  </p>
                </div>

                <div className="relative grid grid-cols-2 gap-2.5">
                  {[
                    { icon: ChefHat, title: 'Adisyon & Mutfak', desc: 'Bölgesel yazıcı' },
                    { icon: BarChart3, title: 'Anlık Raporlar', desc: 'Şube · ürün · personel' },
                    { icon: Smartphone, title: 'QR Menü', desc: 'Garson çağırma, çoklu dil' },
                    { icon: Wifi, title: 'Bulut + Yerel', desc: 'Offline çalışır' },
                    { icon: Printer, title: 'Yazıcı', desc: 'ESC/POS, USB & ağ' },
                    { icon: CreditCard, title: 'Yazarkasa', desc: 'Hugin TPS uyumlu' },
                  ].map((f, i) => (
                    <div
                      key={i}
                      className="bg-slate-800/40 border border-slate-700/60 rounded-lg p-2.5 hover:bg-slate-800/60 hover:border-orange-500/40 transition-all"
                    >
                      <div className="flex items-center gap-2 mb-0.5">
                        <div className="w-6 h-6 rounded-md bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center shrink-0">
                          <f.icon className="w-3.5 h-3.5 text-white" />
                        </div>
                        <h4 className="text-[12px] font-semibold text-white truncate">{f.title}</h4>
                      </div>
                      <p className="text-[10.5px] text-slate-400 leading-snug truncate">{f.desc}</p>
                    </div>
                  ))}
                </div>

                <div className="relative mt-4 pt-4 border-t border-slate-700/50 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <div className="flex -space-x-1.5">
                      {['from-orange-400 to-orange-600','from-red-400 to-red-600','from-amber-400 to-amber-600'].map((g, i) => (
                        <div key={i} className={`w-6 h-6 rounded-full bg-gradient-to-br ${g} ring-2 ring-slate-900`} />
                      ))}
                    </div>
                    <span className="text-[11px] text-slate-400 ml-1">+5.000 işletme</span>
                  </div>
                  <span className="text-[10px] text-slate-500">v1.0 · 2026</span>
                </div>
              </div>
            </div>
          ) : (
            // Register — 1: cep + SMS, 2: işletme bilgileri + şifre
            <div className="max-w-2xl mx-auto">
              <div className="mb-6 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setIsLogin(true);
                    setError('');
                    resetRegisterWizard();
                  }}
                  className="text-orange-500 text-sm font-semibold mb-3 flex items-center gap-1 hover:text-orange-400 transition-colors mx-auto"
                >
                  ← Geri Dön
                </button>
                <p className="text-xs font-semibold text-orange-400/90 tracking-wide uppercase mb-1">
                  Adım {registerWizardStep} / 2
                </p>
                <h2 className="text-2xl md:text-3xl font-bold text-white mb-1">
                  {registerWizardStep === 1 ? 'Cep telefonu ile başlayın' : 'İşletme bilgileri'}
                </h2>
                <p className="text-slate-400 text-sm">
                  {registerWizardStep === 1
                    ? 'Numaranıza SMS ile kod gönderilir; ardından firma ve hesap bilgilerinizi girersiniz.'
                    : 'Zorunlu alanları doldurup kaydı tamamlayın. Ardından kurulum sihirbazına yönlendirileceksiniz.'}
                </p>
              </div>

              {registerWizardStep === 1 && (
                <div className="space-y-4 mb-8">
                  <div>
                    <div className="relative group">
                      <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within:text-orange-500 transition-colors" />
                      <input
                        type="text"
                        value={loginValue}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (isPhoneInput(val) || val === '') setLoginValue(formatPhone(val));
                          else setLoginValue(val);
                          setRegisterErrors((p) => ({ ...p, phone: undefined }));
                        }}
                        placeholder="Cep telefonu (05XX XXX XX XX)"
                        aria-invalid={!!registerErrors.phone}
                        autoComplete="tel"
                        className={`w-full pl-12 pr-36 py-3 bg-slate-800/50 border rounded-lg outline-none text-white text-sm transition-all placeholder:text-slate-500 ${registerFieldRing('phone')}`}
                      />
                      <button
                        type="button"
                        onClick={sendOtp}
                        disabled={loading || otpVerified}
                        className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-md bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold disabled:opacity-50 whitespace-nowrap"
                      >
                        {otpVerified ? 'Doğrulandı' : 'SMS gönder'}
                      </button>
                    </div>
                    {registerErrors.phone && (
                      <p className="text-xs text-red-400 mt-1.5 pl-1">{registerErrors.phone}</p>
                    )}
                  </div>

                  {otpRequested && (
                    <div>
                      <div className="relative group">
                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within:text-orange-500 transition-colors" />
                        <input
                          type="text"
                          inputMode="numeric"
                          value={otpCode}
                          onChange={(e) => {
                            setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6));
                            setRegisterErrors((p) => ({ ...p, otp: undefined }));
                          }}
                          placeholder="SMS doğrulama kodu"
                          aria-invalid={!!registerErrors.otp}
                          className={`w-full pl-12 pr-4 py-3 bg-slate-800/50 border rounded-lg outline-none text-white text-sm transition-all placeholder:text-slate-500 ${registerFieldRing('otp')}`}
                        />
                      </div>
                      {registerErrors.otp && (
                        <p className="text-xs text-red-400 mt-1.5 pl-1">{registerErrors.otp}</p>
                      )}
                    </div>
                  )}

                  {info && (
                    <div className="bg-blue-500/10 border border-blue-500/30 text-blue-300 px-4 py-3 rounded-lg text-sm">
                      {info}
                    </div>
                  )}
                  {error && (
                    <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-sm">
                      {error}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => void advanceToRegisterBusinessStep()}
                    disabled={loading}
                    className="w-full bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-700 hover:to-orange-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-lg text-sm transition-all duration-200 flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-orange-200 border-t-white rounded-full animate-spin" />
                        Kontrol ediliyor...
                      </>
                    ) : (
                      <>
                        Devam
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>
              )}

              {registerWizardStep === 2 && (
                <form onSubmit={handleSubmit} className="space-y-4 mb-8">
                  <button
                    type="button"
                    onClick={() => {
                      setRegisterWizardStep(1);
                      setOtpVerified(false);
                      setOtpRequested(false);
                      setOtpCode('');
                      setOtpToken('');
                      setOtpPhone('');
                      setInfo('');
                      setError('');
                      setRegisterErrors({});
                    }}
                    className="text-slate-400 text-sm hover:text-white transition-colors mb-1"
                  >
                    ← Telefon adımına dön
                  </button>

                  <div>
                    <div className="relative group">
                      <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within:text-orange-500 transition-colors" />
                      <input
                        type="text"
                        value={tenantName}
                        onChange={(e) => {
                          setTenantName(e.target.value);
                          setRegisterErrors((p) => ({ ...p, tenantName: undefined }));
                        }}
                        placeholder="Restoran / işletme adı"
                        aria-invalid={!!registerErrors.tenantName}
                        className={`w-full pl-12 pr-4 py-3 bg-slate-800/50 border rounded-lg outline-none text-white text-sm transition-all placeholder:text-slate-500 ${registerFieldRing('tenantName')}`}
                      />
                    </div>
                    {registerErrors.tenantName && (
                      <p className="text-xs text-red-400 mt-1.5 pl-1">{registerErrors.tenantName}</p>
                    )}
                  </div>

                  <div>
                    <div className="relative group">
                      <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within:text-orange-500 transition-colors" />
                      <input
                        type="text"
                        value={fullName}
                        onChange={(e) => {
                          setFullName(e.target.value);
                          setRegisterErrors((p) => ({ ...p, fullName: undefined }));
                        }}
                        placeholder="Ad soyad"
                        aria-invalid={!!registerErrors.fullName}
                        className={`w-full pl-12 pr-4 py-3 bg-slate-800/50 border rounded-lg outline-none text-white text-sm transition-all placeholder:text-slate-500 ${registerFieldRing('fullName')}`}
                      />
                    </div>
                    {registerErrors.fullName && (
                      <p className="text-xs text-red-400 mt-1.5 pl-1">{registerErrors.fullName}</p>
                    )}
                  </div>

                  <div>
                    <div className="relative group">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within:text-orange-500 transition-colors" />
                      <input
                        type="email"
                        value={registerEmail}
                        onChange={(e) => {
                          setRegisterEmail(e.target.value);
                          setRegisterErrors((p) => ({ ...p, registerEmail: undefined }));
                        }}
                        placeholder="E-posta adresi"
                        aria-invalid={!!registerErrors.registerEmail}
                        autoComplete="email"
                        className={`w-full pl-12 pr-4 py-3 bg-slate-800/50 border rounded-lg outline-none text-white text-sm transition-all placeholder:text-slate-500 ${registerFieldRing('registerEmail')}`}
                      />
                    </div>
                    {registerErrors.registerEmail && (
                      <p className="text-xs text-red-400 mt-1.5 pl-1">{registerErrors.registerEmail}</p>
                    )}
                  </div>

                  <div>
                    <div className="relative group">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within:text-orange-500 transition-colors" />
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          setRegisterErrors((p) => ({ ...p, password: undefined }));
                        }}
                        placeholder="Şifre"
                        aria-invalid={!!registerErrors.password}
                        autoComplete="new-password"
                        className={`w-full pl-12 pr-4 py-3 bg-slate-800/50 border rounded-lg outline-none text-white text-sm transition-all placeholder:text-slate-500 ${registerFieldRing('password')}`}
                      />
                    </div>
                    {registerErrors.password && (
                      <p className="text-xs text-red-400 mt-1.5 pl-1">{registerErrors.password}</p>
                    )}
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
                    <label
                      onClick={() => setRemember((r) => !r)}
                      className="text-sm text-slate-400 select-none cursor-pointer hover:text-slate-300 transition-colors"
                    >
                      Beni hatırla
                    </label>
                  </div>

                  {info && registerWizardStep === 2 && (
                    <div className="bg-blue-500/10 border border-blue-500/30 text-blue-300 px-4 py-3 rounded-lg text-sm">
                      {info}
                    </div>
                  )}

                  {error && (
                    <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-sm whitespace-pre-line leading-relaxed">
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading || signupCooldown > 0}
                    className="w-full bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-700 hover:to-orange-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-lg text-sm transition-all duration-200 flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-orange-200 border-t-white rounded-full animate-spin" />
                        Kaydediliyor...
                      </>
                    ) : signupCooldown > 0 ? (
                      <>Tekrar dene ({signupCooldown}s)</>
                    ) : (
                      <>
                        Kayıt ol ve kuruluma geç
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </form>
              )}

              <p className="text-center text-sm text-slate-400 mt-4">
                Zaten hesabınız var mı?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setIsLogin(true);
                    setError('');
                    resetRegisterWizard();
                  }}
                  className="text-orange-500 font-semibold hover:text-orange-400 transition-colors"
                >
                  Giriş yapın
                </button>
              </p>
            </div>
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
