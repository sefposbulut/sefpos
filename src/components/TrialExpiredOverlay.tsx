import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Lock, Phone, MessageCircle, Mail, LogOut, Sparkles, ShieldCheck, Clock } from 'lucide-react';

const SUPPORT_PHONE = '0850 309 04 04';
const SUPPORT_PHONE_TEL = 'tel:+908503090404';
const SUPPORT_WHATSAPP = 'https://wa.me/908503090404?text=ŞefPOS+lisans+aktivasyonu+istiyorum';
const SUPPORT_EMAIL = 'destek@aykasoft.com.tr';

interface Props {
  /** Sub. expired tarihinde gösterilecek opsiyonel bilgi (örn. "2 gün önce") */
  expiredSinceLabel?: string;
}

export function TrialExpiredOverlay({ expiredSinceLabel }: Props) {
  const { tenant, profile, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  const tenantName = tenant?.name || 'İşletmeniz';
  const initials = (tenantName || 'ŞP')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

  return (
    <div className="fixed inset-0 z-[1000] bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4 overflow-y-auto">
      <div className="absolute inset-0 opacity-20 pointer-events-none">
        <div className="absolute top-10 left-10 w-72 h-72 bg-orange-500 rounded-full mix-blend-overlay blur-3xl" />
        <div className="absolute bottom-10 right-10 w-72 h-72 bg-red-500 rounded-full mix-blend-overlay blur-3xl" />
      </div>

      <div className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden">
        <div className="bg-gradient-to-br from-red-600 via-orange-600 to-amber-500 px-8 pt-8 pb-10 text-white text-center">
          <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest mb-5">
            <Lock className="w-3.5 h-3.5" />
            Erişim Kilitli
          </div>
          <div className="flex justify-center mb-4">
            <div className="w-20 h-20 rounded-2xl bg-white text-orange-600 font-black flex items-center justify-center text-2xl shadow-xl ring-4 ring-white/30">
              {initials}
            </div>
          </div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight">
            Deneme Süreniz Sona Erdi
          </h1>
          <p className="text-white/90 text-sm md:text-base mt-2">
            <span className="font-bold">{tenantName}</span> için 3 günlük ücretsiz deneme tamamlandı.
            {expiredSinceLabel && <span className="opacity-80"> ({expiredSinceLabel})</span>}
          </p>
          <p className="text-white/80 text-xs md:text-sm mt-2 max-w-md mx-auto">
            ŞefPOS&apos;u kesintisiz kullanmak için lütfen lisansınızı aktif edin. Verileriniz, masalarınız ve siparişleriniz güvende — aktivasyonun ardından tüm modüller anında açılır.
          </p>
        </div>

        <div className="p-6 md:p-8">
          <div className="grid sm:grid-cols-3 gap-3 mb-6">
            {[
              { icon: ShieldCheck, t: 'Verileriniz Güvende', d: 'Tüm masalar, siparişler ve raporlar saklanır.' },
              { icon: Sparkles, t: 'Anında Aktivasyon', d: 'Ödeme sonrası 1-2 dakika içinde açılır.' },
              { icon: Clock, t: 'Kesintisiz Geçiş', d: 'Aktivasyon sonrası kaldığınız yerden devam.' },
            ].map(({ icon: Icon, t, d }) => (
              <div key={t} className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 text-center">
                <div className="w-9 h-9 mx-auto mb-2 bg-orange-100 text-orange-600 rounded-xl flex items-center justify-center">
                  <Icon className="w-4 h-4" />
                </div>
                <div className="text-xs font-bold text-slate-800">{t}</div>
                <div className="text-[11px] text-slate-500 mt-0.5 leading-snug">{d}</div>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border-2 border-orange-200 bg-orange-50/60 p-5 mb-5">
            <p className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-orange-600" />
              Lisansı Aktif Et
            </p>
            <div className="grid sm:grid-cols-3 gap-2">
              <a
                href={SUPPORT_WHATSAPP}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-sm shadow-sm transition active:scale-95"
              >
                <MessageCircle className="w-4 h-4" />
                WhatsApp
              </a>
              <a
                href={SUPPORT_PHONE_TEL}
                className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm shadow-sm transition active:scale-95"
              >
                <Phone className="w-4 h-4" />
                {SUPPORT_PHONE}
              </a>
              <a
                href={`mailto:${SUPPORT_EMAIL}?subject=ŞefPOS%20Lisans%20Aktivasyonu&body=Merhaba%2C%0A%0AİŞletme%3A%20${encodeURIComponent(tenantName)}%0AKullanıcı%3A%20${encodeURIComponent(profile?.full_name || '')}%0A%0ALisans%20aktivasyonu%20istiyorum.`}
                className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-sm transition active:scale-95"
              >
                <Mail className="w-4 h-4" />
                E-posta
              </a>
            </div>
            <p className="text-[11px] text-slate-500 mt-3 text-center">
              Lisans aktivasyonu sonrası bu ekran otomatik kapanır.
            </p>
          </div>

          <div className="flex items-center justify-between gap-3 text-xs text-slate-500 border-t pt-4">
            <span>
              {profile?.full_name && (
                <>
                  Oturum: <span className="font-semibold text-slate-700">{profile.full_name}</span>
                </>
              )}
            </span>
            <button
              onClick={async () => {
                setSigningOut(true);
                try {
                  await signOut();
                } finally {
                  setSigningOut(false);
                }
              }}
              disabled={signingOut}
              className="inline-flex items-center gap-1.5 text-slate-600 hover:text-red-600 font-semibold disabled:opacity-50"
            >
              <LogOut className="w-3.5 h-3.5" />
              {signingOut ? 'Çıkış yapılıyor…' : 'Çıkış Yap'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
