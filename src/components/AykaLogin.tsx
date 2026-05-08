import { useState, type FormEvent } from 'react';
import { Lock, Mail, ShieldCheck, KeyRound, Loader2, ArrowLeft } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

// Yalnızca bu e-posta lisans (super-admin) giriş ekranında kullanılabilir.
// Başka bir e-posta veya is_super_admin = false olan bir hesap bu kapıdan geçemez.
const ALLOWED_EMAILS = ['info@aykasoft.com.tr'];
const AYKA_AUTH_KEY = 'shefpos_ayka_auth';

interface AykaLoginProps {
  onBackToLanding?: () => void;
}

export function AykaLogin({ onBackToLanding }: AykaLoginProps) {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError('');

    // Tüm hatalar için aynı generic mesaj — saldırgan, geçerli e-posta /
    // şifre / yetki kombinasyonunu ayırt edemesin.
    const GENERIC_ERROR = 'Geçersiz kimlik bilgileri.';

    const normalized = email.trim().toLowerCase();
    if (!normalized || !password) {
      setError(GENERIC_ERROR);
      return;
    }
    if (!ALLOWED_EMAILS.includes(normalized)) {
      // E-postayı sunucuya bile göndermiyoruz; ama mesaj generic.
      setError(GENERIC_ERROR);
      return;
    }

    setLoading(true);
    try {
      const { error: signInError } = await signIn(normalized, password);
      if (signInError) {
        setError(GENERIC_ERROR);
        setLoading(false);
        return;
      }

      // Giriş tamam; ek güvenlik: profilde is_super_admin yoksa hemen çıkış yap.
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: prof } = await supabase
          .from('profiles')
          .select('is_super_admin, email')
          .eq('id', user.id)
          .maybeSingle();

        const isSuper = prof?.is_super_admin === true;
        const profEmail = String(prof?.email || '').toLowerCase();
        if (!isSuper || (profEmail && !ALLOWED_EMAILS.includes(profEmail))) {
          await supabase.auth.signOut();
          setError(GENERIC_ERROR);
          setLoading(false);
          return;
        }

        try {
          localStorage.setItem(AYKA_AUTH_KEY, '1');
        } catch {
          /* storage erişimi yoksa yok say */
        }
      }
      // Başarılı: AppRouter is_super_admin + AYKA_ADMIN_PATH ile AdminPanel açılır.
    } catch {
      setError(GENERIC_ERROR);
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-8"
      style={{
        background:
          'radial-gradient(ellipse at top, rgba(99,102,241,0.15) 0%, transparent 60%), radial-gradient(ellipse at bottom, rgba(168,85,247,0.12) 0%, transparent 60%), linear-gradient(160deg, #0a0f1f 0%, #0f172a 50%, #1e1b4b 100%)',
      }}
    >
      <div className="w-full max-w-md">
        <button
          type="button"
          onClick={() => {
            if (onBackToLanding) onBackToLanding();
            else window.location.assign('/');
          }}
          className="mb-4 inline-flex items-center gap-1.5 text-slate-400 hover:text-slate-200 text-sm transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Ana sayfa
        </button>

        <div className="bg-slate-900/70 backdrop-blur-xl rounded-2xl p-7 border border-slate-700/50 shadow-2xl">
          <div className="flex flex-col items-center text-center mb-6">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/30 mb-3">
              <ShieldCheck className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-1">Yönetim Erişimi</h1>
            <p className="text-slate-400 text-sm">Devam etmek için kimlik bilgilerinizi girin.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
            <div>
              <label className="text-xs font-medium text-slate-400 mb-1.5 block">Kullanıcı</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder=""
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-800/60 border border-slate-700 hover:border-slate-600 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 text-white placeholder-slate-500 rounded-lg outline-none transition-all text-sm"
                  autoComplete="off"
                  spellCheck={false}
                  disabled={loading}
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-400 mb-1.5 block">Şifre</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder=""
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-800/60 border border-slate-700 hover:border-slate-600 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 text-white placeholder-slate-500 rounded-lg outline-none transition-all text-sm"
                  autoComplete="new-password"
                  disabled={loading}
                />
              </div>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-300 px-3 py-2 rounded-lg text-xs">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 disabled:opacity-60 disabled:cursor-not-allowed text-white py-2.5 rounded-lg font-medium transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/30 text-sm"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Doğrulanıyor…
                </>
              ) : (
                <>
                  <KeyRound className="w-4 h-4" />
                  Lisans Paneline Giriş
                </>
              )}
            </button>
          </form>

          <div className="mt-5 pt-4 border-t border-slate-800/70 text-center">
            <p className="text-[11px] text-slate-500">
              Yetkisiz erişim girişimleri kayıt altına alınır.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
