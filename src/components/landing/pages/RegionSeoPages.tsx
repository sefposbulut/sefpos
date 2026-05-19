import { useMemo, useState } from 'react';
import {
  ArrowRight,
  Check,
  MapPin,
  Search,
  ChevronRight,
  UtensilsCrossed,
  Barcode,
  LayoutGrid,
  Monitor,
} from 'lucide-react';
import type { LandingPageProps } from './LandingPages';
import { SITE } from '../content/siteContent';
import {
  TURKEY_PROVINCES,
  TURKEY_STATS,
  getDistrictBySlugs,
  getProvinceBySlug,
  type ProvinceLoc,
} from '../content/turkeyLocations.generated';
import {
  SEO_SOLUTIONS,
  SEO_SECTORS,
  SEO_FEATURES_SHORT,
  districtMetaDescription,
  districtPageTitle,
  provinceMetaDescription,
  provincePageTitle,
} from '../content/seoContent';
import { SeoHead, breadcrumbJsonLd } from '../seo/SeoHead';
import { CTABand } from '../components/CTABand';
import { SectionHeading } from '../components/SectionHeading';

const SOLUTION_ICONS = {
  adisyon: Monitor,
  barkod: Barcode,
  restoran: UtensilsCrossed,
  masa: LayoutGrid,
} as const;

type Nav = LandingPageProps['onNavigate'];

function Breadcrumbs({
  items,
  onNavigate,
}: {
  items: { label: string; path?: string }[];
  onNavigate: Nav;
}) {
  return (
    <nav className="text-sm text-slate-500 mb-6 flex flex-wrap items-center gap-1" aria-label="Breadcrumb">
      {items.map((item, i) => (
        <span key={`${item.label}-${i}`} className="inline-flex items-center gap-1">
          {i > 0 && <ChevronRight className="w-3.5 h-3.5 opacity-50" />}
          {item.path ? (
            <button type="button" onClick={() => onNavigate(item.path as never)} className="hover:text-orange-600 font-medium">
              {item.label}
            </button>
          ) : (
            <span className="text-slate-800 font-semibold">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

function SolutionsBlock({ placeLabel }: { placeLabel: string }) {
  return (
    <div className="grid sm:grid-cols-2 gap-4">
      {SEO_SOLUTIONS.map((sol) => {
        const Icon = SOLUTION_ICONS[sol.key];
        return (
          <article key={sol.key} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center mb-3">
              <Icon className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-slate-900 mb-2">{sol.title}</h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              {placeLabel} bölgesindeki işletmeler için {sol.desc.charAt(0).toLowerCase() + sol.desc.slice(1)}
            </p>
          </article>
        );
      })}
    </div>
  );
}

function SectorsBlock() {
  return (
    <ul className="flex flex-wrap gap-2">
      {SEO_SECTORS.map((s) => (
        <li key={s} className="text-sm font-medium bg-slate-100 text-slate-700 rounded-full px-3 py-1.5 border border-slate-200">
          {s}
        </li>
      ))}
    </ul>
  );
}

function DistrictGrid({
  province,
  onNavigate,
}: {
  province: ProvinceLoc;
  onNavigate: Nav;
}) {
  return (
    <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
      {province.d.map((d) => (
        <li key={d.s}>
          <button
            type="button"
            onClick={() => onNavigate(`/bolge/${province.s}/${d.s}` as never)}
            className="w-full text-left text-sm font-semibold text-slate-700 hover:text-orange-600 hover:bg-orange-50 rounded-lg px-3 py-2 border border-slate-100 transition"
          >
            {d.n}
          </button>
        </li>
      ))}
    </ul>
  );
}

/** 81 il listesi — Google tarama için iç link merkezi */
export function RegionIndexPage({ onLogin, onNavigate }: LandingPageProps) {
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    const term = q.trim().toLocaleLowerCase('tr-TR');
    if (!term) return TURKEY_PROVINCES;
    return TURKEY_PROVINCES.filter((p) => p.n.toLocaleLowerCase('tr-TR').includes(term));
  }, [q]);

  const path = '/bolge';
  const title = `Türkiye Geneli Adisyon Yazılımı — ${TURKEY_STATS.provinceCount} İl, ${TURKEY_STATS.districtCount} İlçe | ŞefPOS`;
  const description =
    'ŞefPOS ile Türkiye\'nin 81 ilinde ve tüm ilçelerinde restoran, cafe ve paket servis için adisyon yazılımı, barkod sistemi, restoran yazılımı ve masa takip sistemi. İlinizi seçin.';

  return (
    <>
      <SeoHead title={title} description={description} path={path} jsonLd={breadcrumbJsonLd([{ name: 'Ana Sayfa', path: '/' }, { name: 'Bölgeler', path }])} />
      <section className="bg-gradient-to-br from-slate-900 via-slate-900 to-red-950 text-white py-14 md:py-20">
        <div className="max-w-7xl mx-auto px-4">
          <Breadcrumbs items={[{ label: 'Ana Sayfa', path: '/' }, { label: 'Bölgeler' }]} onNavigate={onNavigate} />
          <h1 className="text-3xl md:text-4xl font-black mb-4 max-w-3xl">
            Türkiye genelinde adisyon ve restoran yazılımı
          </h1>
          <p className="text-slate-300 max-w-2xl text-lg leading-relaxed mb-8">
            {TURKEY_STATS.provinceCount} il ve {TURKEY_STATS.districtCount} ilçe için ŞefPOS çözümleri.
            İlinizi veya ilçenizi seçerek bölgenize özel bilgi alın — spam değil, gerçek ürün sayfaları.
          </p>
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="İl ara (ör. Manisa)"
              className="w-full pl-10 pr-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
        </div>
      </section>
      <section className="py-12 bg-white">
        <div className="max-w-7xl mx-auto px-4">
          <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {filtered.map((p) => (
              <li key={p.s}>
                <button
                  type="button"
                  onClick={() => onNavigate(`/bolge/${p.s}` as never)}
                  className="w-full text-left rounded-xl border border-slate-200 p-4 hover:border-orange-300 hover:shadow-md transition group"
                >
                  <p className="font-bold text-slate-900 group-hover:text-orange-600">{p.n}</p>
                  <p className="text-xs text-slate-500 mt-1">{p.d.length} ilçe · {p.b}</p>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </section>
      <CTABand title="Bölgenizde ücretsiz deneyin" subtitle="Kurulum ve eğitim desteğiyle hızlı başlangıç." onPrimary={onLogin} onSecondary={() => onNavigate('/iletisim')} secondaryLabel="İletişim" />
    </>
  );
}

export function ProvinceSeoPage({
  provinceSlug,
  onLogin,
  onNavigate,
}: LandingPageProps & { provinceSlug: string }) {
  const province = getProvinceBySlug(provinceSlug);
  if (!province) return <RegionNotFound onNavigate={onNavigate} />;

  const path = `/bolge/${province.s}`;
  const title = provincePageTitle(province.n);
  const description = provinceMetaDescription(province.n, province.d.length, province.b);

  return (
    <>
      <SeoHead
        title={title}
        description={description}
        path={path}
        jsonLd={breadcrumbJsonLd([
          { name: 'Ana Sayfa', path: '/' },
          { name: 'Bölgeler', path: '/bolge' },
          { name: province.n, path },
        ])}
      />
      <section className="bg-slate-900 text-white py-12 md:py-16">
        <div className="max-w-7xl mx-auto px-4">
          <Breadcrumbs
            items={[{ label: 'Ana Sayfa', path: '/' }, { label: 'Bölgeler', path: '/bolge' }, { label: province.n }]}
            onNavigate={onNavigate}
          />
          <h1 className="text-3xl md:text-4xl font-black mb-4">
            {province.n} adisyon yazılımı ve restoran POS
          </h1>
          <p className="text-slate-300 max-w-2xl leading-relaxed">
            {province.n} ({province.b} bölgesi, plaka {province.p}) genelinde {province.d.length} ilçede
            restoran, cafe, pastane ve paket servis işletmeleri için ŞefPOS kullanılabilir.
            Adisyon yazılımı, barkod sistemi, restoran yazılımı ve masa takip sistemi tek pakette.
          </p>
        </div>
      </section>
      <section className="py-12 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4">
          <SectionHeading title={`${province.n} ilçeleri`} subtitle="İlçenize tıklayarak detaylı bölge sayfasına gidin." />
          <DistrictGrid province={province} onNavigate={onNavigate} />
        </div>
      </section>
      <section className="py-12 bg-white">
        <div className="max-w-7xl mx-auto px-4">
          <SectionHeading title="Çözümler" subtitle={`${province.n} işletmeleri için`} />
          <SolutionsBlock placeLabel={province.n} />
        </div>
      </section>
      <section className="py-12 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4">
          <SectionHeading title="Hangi sektörler kullanır?" />
          <SectorsBlock />
        </div>
      </section>
      <CTABand title={`${province.n} için ücretsiz deneyin`} onPrimary={onLogin} onSecondary={() => { window.location.href = SITE.phoneTel; }} secondaryLabel="Hemen Arayın" />
    </>
  );
}

export function DistrictSeoPage({
  provinceSlug,
  districtSlug,
  onLogin,
  onNavigate,
}: LandingPageProps & { provinceSlug: string; districtSlug: string }) {
  const match = getDistrictBySlugs(provinceSlug, districtSlug);
  if (!match) return <RegionNotFound onNavigate={onNavigate} />;
  const { province, district } = match;

  const path = `/bolge/${province.s}/${district.s}`;
  const title = districtPageTitle(district.n, province.n);
  const description = districtMetaDescription(district.n, province.n, province.b);
  const popLine = district.pop
    ? ` Yaklaşık ${Number(district.pop).toLocaleString('tr-TR')} nüfuslu ${district.n} ilçesinde`
    : ` ${district.n} ilçesinde`;

  const siblings = province.d.filter((d) => d.s !== district.s).slice(0, 12);

  return (
    <>
      <SeoHead
        title={`${title} | ${SITE.name}`}
        description={description}
        path={path}
        jsonLd={[
          breadcrumbJsonLd([
            { name: 'Ana Sayfa', path: '/' },
            { name: 'Bölgeler', path: '/bolge' },
            { name: province.n, path: `/bolge/${province.s}` },
            { name: district.n, path },
          ]),
          {
            '@context': 'https://schema.org',
            '@type': 'SoftwareApplication',
            name: 'ŞefPOS',
            applicationCategory: 'BusinessApplication',
            operatingSystem: 'Windows',
            description,
            areaServed: { '@type': 'City', name: `${district.n}, ${province.n}, Türkiye` },
          },
        ]}
      />
      <section className="bg-slate-900 text-white py-12 md:py-16">
        <div className="max-w-7xl mx-auto px-4">
          <Breadcrumbs
            items={[
              { label: 'Ana Sayfa', path: '/' },
              { label: 'Bölgeler', path: '/bolge' },
              { label: province.n, path: `/bolge/${province.s}` },
              { label: district.n },
            ]}
            onNavigate={onNavigate}
          />
          <p className="text-orange-400 text-sm font-bold uppercase tracking-wider mb-2 flex items-center gap-1">
            <MapPin className="w-4 h-4" /> {province.n} · {province.b}
          </p>
          <h1 className="text-3xl md:text-4xl font-black mb-4">
            {district.n} adisyon yazılımı
          </h1>
          <p className="text-slate-300 max-w-2xl text-lg leading-relaxed">
            {popLine} faaliyet gösteren restoran, cafe, kebap salonu, pastane ve paket servis işletmeleri
            için profesyonel adisyon ve POS çözümü. Masa takip sistemi, barkod destekli stok ve online
            platform siparişleri tek panelde toplanır.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3">
            <button type="button" onClick={onLogin} className="landing-btn-primary">
              Ücretsiz Dene <ArrowRight className="w-5 h-5" />
            </button>
            <button type="button" onClick={() => onNavigate('/ozellikler')} className="landing-btn-outline border-white/30 text-white hover:bg-white/10">
              Tüm özellikler
            </button>
          </div>
        </div>
      </section>

      <section className="py-12 bg-white">
        <div className="max-w-7xl mx-auto px-4">
          <SectionHeading title={`${district.n} için çözümler`} />
          <SolutionsBlock placeLabel={`${district.n}, ${province.n}`} />
        </div>
      </section>

      <section className="py-12 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4">
          <SectionHeading title="Sektörler" subtitle="ŞefPOS bu işletme türlerinde kullanılır" />
          <SectorsBlock />
        </div>
      </section>

      <section className="py-12 bg-white">
        <div className="max-w-4xl mx-auto px-4">
          <SectionHeading title="Öne çıkan yetenekler" />
          <ul className="space-y-3">
            {SEO_FEATURES_SHORT.map((f) => (
              <li key={f} className="flex gap-3 text-slate-700">
                <Check className="w-5 h-5 text-orange-500 shrink-0 mt-0.5" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {siblings.length > 0 && (
        <section className="py-12 bg-slate-50 border-t border-slate-200">
          <div className="max-w-7xl mx-auto px-4">
            <SectionHeading title={`${province.n} — diğer ilçeler`} subtitle="Yakın bölgeler için de aynı altyapı" />
            <ul className="flex flex-wrap gap-2">
              {siblings.map((d) => (
                <li key={d.s}>
                  <button
                    type="button"
                    onClick={() => onNavigate(`/bolge/${province.s}/${d.s}` as never)}
                    className="text-sm font-semibold text-slate-600 hover:text-orange-600 bg-white border border-slate-200 rounded-full px-3 py-1.5"
                  >
                    {d.n}
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" onClick={() => onNavigate(`/bolge/${province.s}` as never)} className="mt-4 text-orange-600 font-bold text-sm inline-flex items-center gap-1">
              Tüm {province.n} ilçeleri <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </section>
      )}

      <CTABand
        title={`${district.n} işletmeniz için ŞefPOS`}
        subtitle="Ücretsiz deneme — kurulum ve Türkçe destek."
        onPrimary={onLogin}
        onSecondary={() => { window.location.href = SITE.whatsapp; }}
        secondaryLabel="WhatsApp"
      />
    </>
  );
}

function RegionNotFound({ onNavigate }: { onNavigate: Nav }) {
  return (
    <section className="py-24 text-center px-4">
      <h1 className="text-2xl font-black text-slate-900 mb-4">Sayfa bulunamadı</h1>
      <button type="button" onClick={() => onNavigate('/bolge' as never)} className="text-orange-600 font-bold">
        İl ve ilçe listesine dön →
      </button>
    </section>
  );
}
