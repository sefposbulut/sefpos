import { useState, useEffect, type ReactNode } from 'react';
import { Menu, X, Phone, MapPin, MessageCircle, ArrowRight, ChevronDown } from 'lucide-react';
import { BrandLogo } from './components/BrandLogo';
import { SITE, LANDING_NAV, type LandingRoute } from './content/siteContent';
import { FeaturesMegaMenu } from './components/FeaturesMegaMenu';
import { FeaturesNavList } from './components/FeaturesNavList';
import { landingPathTitle, type ParsedLandingPath } from './landingRoutes';
import { getDistrictBySlugs, getProvinceBySlug } from './content/turkeyLocations.generated';

type Props = {
  parsed: ParsedLandingPath;
  onNavigate: (path: string) => void;
  onLogin: () => void;
  children: ReactNode;
};

function footerLabel(parsed: ParsedLandingPath): string {
  if (parsed.kind === 'province') {
    const p = getProvinceBySlug(parsed.provinceSlug);
    return p ? `${p.n} — Bölge` : landingPathTitle(parsed);
  }
  if (parsed.kind === 'district') {
    const m = getDistrictBySlugs(parsed.provinceSlug, parsed.districtSlug);
    return m ? `${m.district.n}, ${m.province.n}` : landingPathTitle(parsed);
  }
  return landingPathTitle(parsed);
}

export function LandingLayout({ parsed, onNavigate, onLogin, children }: Props) {
  const staticRoute = parsed.kind === 'static' ? parsed.route : null;
  const [menuOpen, setMenuOpen] = useState(false);
  const [featuresSubmenuOpen, setFeaturesSubmenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
    setFeaturesSubmenuOpen(false);
  }, [parsed]);

  useEffect(() => {
    if (!menuOpen) setFeaturesSubmenuOpen(false);
  }, [menuOpen]);

  const navLink = (path: LandingRoute) => {
    if (path === '/ozellikler') {
      return (
        <FeaturesMegaMenu
          key={path}
          isActive={staticRoute === '/ozellikler'}
          onNavigate={onNavigate}
        />
      );
    }
    return (
      <button
        type="button"
        key={path}
        onClick={() => onNavigate(path)}
        className={`text-sm font-semibold transition-colors ${
          staticRoute === path ? 'text-orange-600' : 'text-slate-600 hover:text-orange-600'
        }`}
      >
        {LANDING_NAV.find((n) => n.path === path)?.label}
      </button>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans antialiased">
      <header
        className={`sticky top-0 z-50 bg-white border-b border-slate-200 transition-shadow duration-300 ${
          scrolled ? 'shadow-md' : ''
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 md:h-20">
            <button
              type="button"
              onClick={() => onNavigate('/')}
              className="flex items-center gap-2 group rounded-full transition-transform hover:scale-[1.02]"
            >
              <BrandLogo size="lg" />
            </button>

            <nav className="hidden lg:flex items-center gap-8">{LANDING_NAV.map((n) => navLink(n.path))}</nav>

            <div className="hidden lg:flex items-center gap-3">
              <a
                href={SITE.phoneTel}
                className="text-sm font-semibold flex items-center gap-1 text-slate-600 hover:text-orange-600"
              >
                <Phone className="w-4 h-4" /> {SITE.phone}
              </a>
              <button type="button" onClick={onLogin} className="bg-slate-900 hover:bg-slate-800 text-white font-bold px-5 py-2.5 rounded-xl text-sm transition">
                Giriş Yap
              </button>
              <button type="button" onClick={onLogin} className="bg-orange-500 hover:bg-orange-600 text-white font-bold px-5 py-2.5 rounded-xl text-sm transition inline-flex items-center gap-1 shadow-md shadow-orange-500/35">
                Ücretsiz Dene <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            <button
              type="button"
              className="lg:hidden p-2 text-slate-700"
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label="Menü"
            >
              {menuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {menuOpen && (
          <div className="lg:hidden border-t border-slate-200 bg-white px-4 py-4 space-y-3 shadow-lg max-h-[85vh] overflow-y-auto">
            {LANDING_NAV.map((n) =>
              n.path === '/ozellikler' ? (
                <div key={n.path} className="border-b border-slate-100 pb-2 mb-1">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        onNavigate('/ozellikler');
                      }}
                      className="flex-1 text-left font-semibold text-slate-800 py-2"
                    >
                      {n.label}
                    </button>
                    <button
                      type="button"
                      onClick={() => setFeaturesSubmenuOpen((v) => !v)}
                      className="p-2 rounded-lg text-slate-500 hover:bg-slate-100"
                      aria-expanded={featuresSubmenuOpen}
                      aria-label={featuresSubmenuOpen ? 'Özellik listesini gizle' : 'Özellik listesini göster'}
                    >
                      <ChevronDown
                        className={`w-5 h-5 transition-transform ${featuresSubmenuOpen ? 'rotate-180' : ''}`}
                      />
                    </button>
                  </div>
                  {featuresSubmenuOpen && (
                    <div className="pl-1 pr-1 pb-2">
                      <FeaturesNavList
                        activeId={null}
                        compact
                        onSelect={(id) => {
                          setMenuOpen(false);
                          setFeaturesSubmenuOpen(false);
                          onNavigate(`/ozellikler#${id}`);
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setMenuOpen(false);
                          setFeaturesSubmenuOpen(false);
                          onNavigate('/ozellikler');
                        }}
                        className="mt-2 w-full text-left text-sm font-bold text-orange-600 py-2"
                      >
                        Tüm özellikleri gör →
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <button
                  key={n.path}
                  type="button"
                  onClick={() => onNavigate(n.path)}
                  className="block w-full text-left font-semibold text-slate-700 py-2"
                >
                  {n.label}
                </button>
              ),
            )}
            <button type="button" onClick={onLogin} className="w-full bg-orange-600 text-white font-bold py-3 rounded-xl">Giriş Yap</button>
          </div>
        )}
      </header>

      <main>{children}</main>

      <footer className="bg-slate-950 text-slate-300">
        <div className="max-w-7xl mx-auto px-4 py-16 grid md:grid-cols-4 gap-10">
          <div className="md:col-span-2">
            <div className="mb-4">
              <BrandLogo size="xl" onDark />
            </div>
            <p className="text-slate-400 max-w-md leading-relaxed mb-4">{SITE.tagline}. Türkiye genelinde restoran, cafe ve paket servis işletmeleri için tasarlandı.</p>
            <p className="text-sm font-bold text-white/90 mb-2">{SITE.companyName}</p>
            <div className="space-y-2 text-sm">
              <a href={SITE.phoneTel} className="flex items-center gap-2 hover:text-orange-400"><Phone className="w-4 h-4" /> {SITE.phone}</a>
              <a href={`mailto:${SITE.email}`} className="flex items-center gap-2 hover:text-orange-400">{SITE.email}</a>
              <p className="flex items-start gap-2 text-slate-400 leading-snug">
                <MapPin className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  {SITE.addressLine}
                  <br />
                  {SITE.addressCity}
                </span>
              </p>
            </div>
          </div>
          <div>
            <h4 className="font-bold text-white mb-4">Sayfalar</h4>
            <ul className="space-y-2 text-sm">
              {LANDING_NAV.map((n) => (
                <li key={n.path}>
                  <button type="button" onClick={() => onNavigate(n.path)} className="hover:text-orange-400">{n.label}</button>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="font-bold text-white mb-4">Hızlı erişim</h4>
            <ul className="space-y-2 text-sm">
              <li><button type="button" onClick={() => onNavigate('/bolge')} className="hover:text-orange-400">Türkiye — il ve ilçeler</button></li>
              <li><button type="button" onClick={() => onNavigate('/indir')} className="hover:text-orange-400">Windows indir</button></li>
              <li><button type="button" onClick={() => onNavigate('/bayi')} className="hover:text-orange-400">Bayi programı</button></li>
              <li><a href={SITE.whatsapp} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-orange-400"><MessageCircle className="w-4 h-4" /> WhatsApp</a></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-slate-800 py-6 text-center text-sm text-slate-500">
          © {new Date().getFullYear()} {SITE.name} — {footerLabel(parsed)} · Tüm hakları saklıdır.
        </div>
      </footer>
    </div>
  );
}
