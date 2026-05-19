import fs from 'fs';
import path from 'path';

const root = path.join(process.cwd(), 'src/components/landing');
const D = 'div';

function w(rel, content) {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const fixed = content.replaceAll('<motion.div', '<div').replaceAll('</motion.div', '</div');
  fs.writeFileSync(file, fixed, 'utf8');
  console.log('wrote', rel);
}

w('LandingLayout.tsx', `import { useState, useEffect, type ReactNode } from 'react';
import { Menu, X, ChefHat, Phone, MapPin, MessageCircle, ArrowRight } from 'lucide-react';
import { SITE, LANDING_NAV, type LandingRoute } from './content/siteContent';
import { landingPathTitle } from './landingRoutes';

type Props = {
  route: LandingRoute;
  onNavigate: (path: LandingRoute) => void;
  onLogin: () => void;
  children: ReactNode;
};

export function LandingLayout({ route, onNavigate, onLogin, children }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [route]);

  const navLink = (path: LandingRoute) => (
    <button
      type="button"
      key={path}
      onClick={() => onNavigate(path)}
      className={\`text-sm font-semibold transition-colors \${
        route === path ? 'text-orange-600' : 'text-slate-600 hover:text-orange-600'
      }\`}
    >
      {LANDING_NAV.find((n) => n.path === path)?.label}
    </button>
  );

  return (
    <${D} className="min-h-screen bg-slate-50 text-slate-900 font-sans antialiased">
      <header
        className={\`sticky top-0 z-50 transition-all duration-300 \${
          scrolled ? 'bg-white/95 backdrop-blur-md shadow-md border-b border-slate-200/60' : 'bg-transparent'
        }\`}
      >
        <${D} className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <${D} className="flex items-center justify-between h-16 md:h-20">
            <button type="button" onClick={() => onNavigate('/')} className="flex items-center gap-2 group">
              <${D} className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shadow-lg shadow-orange-500/30 group-hover:scale-105 transition-transform">
                <ChefHat className="w-6 h-6 text-white" />
              </${D}>
              <span className="text-xl font-black tracking-tight">
                <span className="text-slate-900">Şef</span>
                <span className="text-orange-600">POS</span>
              </span>
            </button>

            <nav className="hidden lg:flex items-center gap-8">{LANDING_NAV.map((n) => navLink(n.path))}</nav>

            <${D} className="hidden lg:flex items-center gap-3">
              <a href={SITE.phoneTel} className="text-sm font-semibold text-slate-600 hover:text-orange-600 flex items-center gap-1">
                <Phone className="w-4 h-4" /> {SITE.phone}
              </a>
              <button type="button" onClick={onLogin} className="bg-slate-900 hover:bg-slate-800 text-white font-bold px-5 py-2.5 rounded-xl text-sm transition">
                Giriş Yap
              </button>
              <button type="button" onClick={onLogin} className="bg-orange-600 hover:bg-orange-700 text-white font-bold px-5 py-2.5 rounded-xl text-sm transition inline-flex items-center gap-1">
                Ücretsiz Dene <ArrowRight className="w-4 h-4" />
              </button>
            </${D}>

            <button type="button" className="lg:hidden p-2 text-slate-700" onClick={() => setMenuOpen(!menuOpen)} aria-label="Menü">
              {menuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </${D}>
        </${D}>

        {menuOpen && (
          <${D} className="lg:hidden border-t border-slate-200 bg-white px-4 py-4 space-y-3 shadow-lg">
            {LANDING_NAV.map((n) => (
              <button key={n.path} type="button" onClick={() => onNavigate(n.path)} className="block w-full text-left font-semibold text-slate-700 py-2">
                {n.label}
              </button>
            ))}
            <button type="button" onClick={onLogin} className="w-full bg-orange-600 text-white font-bold py-3 rounded-xl">Giriş Yap</button>
          </${D}>
        )}
      </header>

      <main>{children}</main>

      <footer className="bg-slate-950 text-slate-300">
        <${D} className="max-w-7xl mx-auto px-4 py-16 grid md:grid-cols-4 gap-10">
          <${D} className="md:col-span-2">
            <${D} className="flex items-center gap-2 mb-4">
              <ChefHat className="w-8 h-8 text-orange-500" />
              <span className="text-2xl font-black text-white">{SITE.name}</span>
            </${D}>
            <p className="text-slate-400 max-w-md leading-relaxed mb-4">{SITE.tagline}. Türkiye genelinde restoran, cafe ve paket servis işletmeleri için tasarlandı.</p>
            <${D} className="space-y-2 text-sm">
              <a href={SITE.phoneTel} className="flex items-center gap-2 hover:text-orange-400"><Phone className="w-4 h-4" /> {SITE.phone}</a>
              <a href={\`mailto:\${SITE.email}\`} className="flex items-center gap-2 hover:text-orange-400">{SITE.email}</a>
              <p className="flex items-center gap-2"><MapPin className="w-4 h-4" /> {SITE.address}</p>
            </${D}>
          </${D}>
          <${D}>
            <h4 className="font-bold text-white mb-4">Sayfalar</h4>
            <ul className="space-y-2 text-sm">
              {LANDING_NAV.map((n) => (
                <li key={n.path}>
                  <button type="button" onClick={() => onNavigate(n.path)} className="hover:text-orange-400">{n.label}</button>
                </li>
              ))}
            </ul>
          </${D}>
          <${D}>
            <h4 className="font-bold text-white mb-4">Hızlı erişim</h4>
            <ul className="space-y-2 text-sm">
              <li><button type="button" onClick={() => onNavigate('/indir')} className="hover:text-orange-400">Windows indir</button></li>
              <li><button type="button" onClick={() => onNavigate('/bayi')} className="hover:text-orange-400">Bayi programı</button></li>
              <li><a href={SITE.whatsapp} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-orange-400"><MessageCircle className="w-4 h-4" /> WhatsApp</a></li>
            </ul>
          </${D}>
        </${D}>
        <${D} className="border-t border-slate-800 py-6 text-center text-sm text-slate-500">
          © {new Date().getFullYear()} {SITE.name} — {landingPathTitle(route)} · Tüm hakları saklıdır.
        </${D}>
      </footer>
    </${D}>
  );
}
`);

w('LandingSite.tsx', `import { useState, useEffect, useCallback } from 'react';
import { LandingLayout } from './LandingLayout';
import { normalizeLandingPath, landingPathTitle } from './landingRoutes';
import type { LandingRoute } from './content/siteContent';
import { SITE } from './content/siteContent';
import {
  HomePage,
  FeaturesPage,
  IntegrationsPage,
  PricingPage,
  DownloadPage,
  ResellerPage,
  ContactPage,
} from './pages/LandingPages';

interface LandingSiteProps {
  onLogin: () => void;
}

export function LandingSite({ onLogin }: LandingSiteProps) {
  const [route, setRoute] = useState<LandingRoute>(() =>
    typeof window !== 'undefined' ? normalizeLandingPath(window.location.pathname) : '/',
  );

  const navigate = useCallback((path: LandingRoute) => {
    const next = normalizeLandingPath(path);
    if (typeof window !== 'undefined' && window.location.pathname !== next) {
      window.history.pushState({}, '', next);
    }
    setRoute(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    const onPop = () => setRoute(normalizeLandingPath(window.location.pathname));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    const title = landingPathTitle(route);
    document.title = route === '/' ? \`\${SITE.name} — Restoran POS & Online Sipariş\` : \`\${title} | \${SITE.name}\`;
  }, [route]);

  const pageProps = { onLogin, onNavigate: navigate };

  let page;
  switch (route) {
    case '/ozellikler':
      page = <FeaturesPage {...pageProps} />;
      break;
    case '/entegrasyonlar':
      page = <IntegrationsPage {...pageProps} />;
      break;
    case '/fiyatlar':
      page = <PricingPage {...pageProps} />;
      break;
    case '/indir':
      page = <DownloadPage {...pageProps} />;
      break;
    case '/bayi':
      page = <ResellerPage {...pageProps} />;
      break;
    case '/iletisim':
      page = <ContactPage {...pageProps} />;
      break;
    default:
      page = <HomePage {...pageProps} />;
  }

  return (
    <LandingLayout route={route} onNavigate={navigate} onLogin={onLogin}>
      {page}
    </LandingLayout>
  );
}
`);

console.log('Run part 2 for LandingPages');
