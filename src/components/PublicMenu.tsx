import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChefHat,
  MapPin,
  Phone,
  Search,
  AlertCircle,
  Loader2,
  Bell,
  X,
  CheckCircle2,
  Receipt,
  Droplets,
  HelpCircle,
} from 'lucide-react';
import {
  loadPublicMenu,
  createWaiterCall,
  PublicMenuData,
  PublicMenuError,
  PublicProduct,
  MenuTheme,
} from '../lib/publicMenuData';

const PRIMARY_DEFAULT = '#0F172A';
const ACCENT_DEFAULT = '#F97316';
const TABLE_LS_KEY = 'sefpos_qr_last_table';

interface Props {
  branchId: string;
}

interface ResolvedTheme {
  primary: string;
  accent: string;
  mode: 'light' | 'dark';
  fontStyle: 'modern' | 'elegant' | 'casual';
  heroStyle: 'gradient' | 'image' | 'solid';
  heroImageUrl: string | null;
  showCategoryImages: boolean;
}

export function PublicMenu({ branchId }: Props) {
  const [data, setData] = useState<PublicMenuData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [waiterOpen, setWaiterOpen] = useState(false);
  const sectionsRef = useRef<Record<string, HTMLElement | null>>({});

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    loadPublicMenu(branchId)
      .then(d => {
        if (!cancelled) {
          setData(d);
          document.title = `${d.tenant.name} · Menü`;
        }
      })
      .catch((e: PublicMenuError | Error) => {
        if (cancelled) return;
        if (e instanceof PublicMenuError) {
          if (e.code === 'NOT_FOUND') setError('Bu menüye ulaşılamıyor.');
          else if (e.code === 'DISABLED') setError('Bu menü şu an kapalı.');
          else setError('Menü yüklenemedi: ' + e.message);
        } else {
          setError('Menü yüklenemedi.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [branchId]);

  const theme = useMemo<ResolvedTheme>(() => resolveTheme(data?.tenant.menu_theme || null), [data]);

  const visibleCategories = useMemo(() => {
    if (!data) return [];
    const productCatIds = new Set(
      data.products.map(p => p.category_id).filter((x): x is string => !!x)
    );
    return data.categories.filter(c => productCatIds.has(c.id));
  }, [data]);

  const productsByCategory = useMemo(() => {
    const m = new Map<string, PublicProduct[]>();
    if (!data) return m;
    const lower = search.trim().toLocaleLowerCase('tr-TR');
    for (const p of data.products) {
      if (!p.category_id) continue;
      if (
        lower &&
        !p.name.toLocaleLowerCase('tr-TR').includes(lower) &&
        !(p.description || '').toLocaleLowerCase('tr-TR').includes(lower)
      )
        continue;
      const list = m.get(p.category_id) || [];
      list.push(p);
      m.set(p.category_id, list);
    }
    return m;
  }, [data, search]);

  const filteredCategoriesShown = useMemo(() => {
    if (activeCategory === 'all') {
      return visibleCategories.filter(c => (productsByCategory.get(c.id) || []).length > 0);
    }
    return visibleCategories.filter(c => c.id === activeCategory);
  }, [visibleCategories, activeCategory, productsByCategory]);

  const isDark = theme.mode === 'dark';
  const fontClass = fontFamilyClass(theme.fontStyle);

  const scrollToCategory = (id: string) => {
    setActiveCategory(id);
    if (id === 'all') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    requestAnimationFrame(() => {
      const el = sectionsRef.current[id];
      if (el) {
        const y = el.getBoundingClientRect().top + window.scrollY - 130;
        window.scrollTo({ top: y, behavior: 'smooth' });
      }
    });
  };

  if (loading) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${isDark ? 'bg-slate-950' : 'bg-slate-50'}`}>
        <Loader2 className={`w-10 h-10 animate-spin ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className={`min-h-screen flex items-center justify-center p-6 ${isDark ? 'bg-slate-950' : 'bg-slate-50'}`}>
        <div className={`rounded-2xl shadow-xl max-w-md w-full p-8 text-center border ${
          isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
        }`}>
          <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-red-50 text-red-600 flex items-center justify-center">
            <AlertCircle className="w-7 h-7" />
          </div>
          <h1 className={`text-xl font-bold mb-2 ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
            Menü Görüntülenemiyor
          </h1>
          <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            {error || 'Bilinmeyen hata'}
          </p>
        </div>
      </div>
    );
  }

  const { tenant, branch } = data;

  return (
    <div className={`${fontClass} min-h-screen ${
      isDark ? 'bg-slate-950 text-slate-100' : 'bg-gradient-to-b from-slate-50 to-white text-slate-900'
    }`}>
      {/* HERO */}
      <header className="relative overflow-hidden text-white">
        <div
          className="absolute inset-0"
          style={{
            background:
              theme.heroStyle === 'image' && theme.heroImageUrl
                ? `linear-gradient(180deg, rgba(0,0,0,.35), rgba(0,0,0,.65)), url(${theme.heroImageUrl}) center/cover no-repeat`
                : theme.heroStyle === 'solid'
                ? theme.primary
                : `radial-gradient(circle at 0% 0%, ${shade(theme.accent, 20)}33, transparent 50%), linear-gradient(135deg, ${theme.primary}, ${shade(theme.primary, isDark ? 25 : -15)})`,
          }}
        />
        <div className="relative max-w-3xl mx-auto px-4 sm:px-6 pt-8 sm:pt-10 pb-5">
          <div className="flex items-center gap-4">
            {tenant.logo_url ? (
              <img
                src={tenant.logo_url}
                alt={tenant.name}
                className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl object-cover border-2 border-white/30 shadow-2xl bg-white/10"
              />
            ) : (
              <div
                className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl flex items-center justify-center border-2 border-white/30 shadow-2xl"
                style={{ backgroundColor: theme.accent }}
              >
                <ChefHat className="w-10 h-10 text-white" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight drop-shadow-sm truncate">
                {tenant.name}
              </h1>
              <p className="text-sm sm:text-base text-white/85 mt-1 truncate font-medium">
                {branch.name}
              </p>
            </div>
          </div>
          {(branch.address || branch.phone || tenant.address || tenant.phone) && (
            <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-white/90">
              {(branch.address || tenant.address) && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 flex-shrink-0" />
                  <span className="truncate max-w-[260px]">{branch.address || tenant.address}</span>
                </span>
              )}
              {(branch.phone || tenant.phone) && (
                <a
                  href={`tel:${(branch.phone || tenant.phone || '').replace(/\s/g, '')}`}
                  className="inline-flex items-center gap-1.5 hover:underline"
                >
                  <Phone className="w-4 h-4" />
                  {branch.phone || tenant.phone}
                </a>
              )}
            </div>
          )}
        </div>
      </header>

      {/* STICKY: arama + kategoriler */}
      <div
        className={`sticky top-0 z-30 backdrop-blur-md border-b ${
          isDark ? 'bg-slate-950/85 border-slate-800' : 'bg-white/90 border-slate-200'
        }`}
      >
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3 space-y-2.5">
          <div className="relative">
            <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${
              isDark ? 'text-slate-500' : 'text-slate-400'
            }`} />
            <input
              type="search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Ürün ara..."
              className={`w-full pl-10 pr-3 py-2.5 rounded-xl outline-none text-sm shadow-sm focus:ring-2 transition ${
                isDark
                  ? 'bg-slate-900 text-slate-100 placeholder-slate-500 ring-1 ring-slate-800 focus:ring-slate-600'
                  : 'bg-white text-slate-800 placeholder-slate-400 ring-1 ring-slate-200 focus:ring-slate-300'
              }`}
              style={{ accentColor: theme.accent }}
            />
          </div>

          <div className="flex gap-2 overflow-x-auto scroll-smooth pb-1 -mx-1 px-1">
            <CategoryPill
              active={activeCategory === 'all'}
              accent={theme.accent}
              isDark={isDark}
              onClick={() => scrollToCategory('all')}
            >
              Tümü
            </CategoryPill>
            {visibleCategories.map(c => {
              const count = (productsByCategory.get(c.id) || []).length;
              if (count === 0 && search.trim()) return null;
              return (
                <CategoryPill
                  key={c.id}
                  active={activeCategory === c.id}
                  accent={theme.accent}
                  color={c.color || undefined}
                  isDark={isDark}
                  onClick={() => scrollToCategory(c.id)}
                >
                  {c.name}
                  <span className="ml-1.5 text-[11px] opacity-70">{count}</span>
                </CategoryPill>
              );
            })}
          </div>
        </div>
      </div>

      {/* İÇERİK */}
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 pb-28 space-y-10">
        {filteredCategoriesShown.length === 0 ? (
          <div className={`text-center py-16 ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
            <div className="text-5xl mb-3">🍽️</div>
            <p>{search.trim() ? 'Aramayla eşleşen ürün yok.' : 'Henüz ürün eklenmemiş.'}</p>
          </div>
        ) : (
          filteredCategoriesShown.map(cat => {
            const items = productsByCategory.get(cat.id) || [];
            if (items.length === 0) return null;
            return (
              <section
                key={cat.id}
                ref={(el) => { sectionsRef.current[cat.id] = el; }}
                className="scroll-mt-32"
              >
                <div className="flex items-center gap-3 mb-4">
                  <span
                    className="w-1.5 h-7 rounded-full flex-shrink-0"
                    style={{ backgroundColor: cat.color || theme.accent }}
                  />
                  <h2 className={`text-2xl font-extrabold tracking-tight ${
                    isDark ? 'text-slate-100' : 'text-slate-800'
                  }`}>
                    {cat.name}
                  </h2>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                    isDark ? 'bg-slate-800 text-slate-400' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {items.length} ürün
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  {items.map(p => (
                    <ProductCard
                      key={p.id}
                      product={p}
                      accent={theme.accent}
                      isDark={isDark}
                    />
                  ))}
                </div>
              </section>
            );
          })
        )}
      </main>

      {/* GARSON ÇAĞIR — Floating */}
      <button
        onClick={() => setWaiterOpen(true)}
        className="fixed z-40 bottom-5 right-5 sm:bottom-7 sm:right-7 inline-flex items-center gap-2.5 pl-4 pr-5 py-3.5 rounded-full font-bold shadow-2xl transition-all hover:scale-[1.03] active:scale-95 text-white"
        style={{
          background: `linear-gradient(135deg, ${theme.accent}, ${shade(theme.accent, -15)})`,
          boxShadow: `0 10px 30px -8px ${theme.accent}99`,
        }}
        aria-label="Garson Çağır"
      >
        <span className="relative flex w-3 h-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-70" />
          <span className="relative inline-flex rounded-full h-3 w-3 bg-white" />
        </span>
        <Bell className="w-5 h-5" />
        <span className="hidden sm:inline">Garson Çağır</span>
        <span className="sm:hidden">Garson</span>
      </button>

      {waiterOpen && (
        <WaiterCallModal
          tenantId={tenant.id}
          branchId={branch.id}
          accent={theme.accent}
          isDark={isDark}
          onClose={() => setWaiterOpen(false)}
        />
      )}

      <footer className={`border-t mt-4 py-6 text-center ${
        isDark ? 'border-slate-800' : 'border-slate-200'
      }`}>
        <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
          {tenant.name} · {branch.name} · QR Menü
        </p>
        <p className={`text-[10px] mt-1 ${isDark ? 'text-slate-600' : 'text-slate-300'}`}>
          Powered by ŞefPOS
        </p>
      </footer>
    </div>
  );
}

function CategoryPill({
  active,
  accent,
  color,
  isDark,
  onClick,
  children,
}: {
  active: boolean;
  accent: string;
  color?: string;
  isDark: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-all ${
        active
          ? 'text-white shadow-md'
          : isDark
            ? 'bg-slate-900 text-slate-200 hover:bg-slate-800 border border-slate-800'
            : 'bg-white text-slate-700 hover:shadow-md border border-slate-200'
      }`}
      style={active ? { backgroundColor: color || accent } : undefined}
    >
      {children}
    </button>
  );
}

function ProductCard({
  product,
  accent,
  isDark,
}: {
  product: PublicProduct;
  accent: string;
  isDark: boolean;
}) {
  const variants = product.variants || [];
  const hasVariants = variants.length > 0;
  const minPrice = hasVariants
    ? Math.min(product.price, ...variants.map(v => product.price + Number(v.price_modifier || 0)))
    : product.price;

  return (
    <div className={`rounded-2xl overflow-hidden border shadow-sm hover:shadow-md transition-all flex flex-col ${
      isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
    }`}>
      {product.image_url && (
        <div className="relative aspect-[16/10] overflow-hidden bg-slate-100">
          <img
            src={product.image_url}
            alt={product.name}
            loading="lazy"
            className="w-full h-full object-cover hover:scale-[1.04] transition-transform duration-500"
          />
          {hasVariants && (
            <div
              className="absolute top-2 right-2 px-2.5 py-1 rounded-full text-[11px] font-bold text-white shadow-md"
              style={{ backgroundColor: accent }}
            >
              {variants.length} seçenek
            </div>
          )}
        </div>
      )}
      <div className="p-3 sm:p-4 flex-1 flex flex-col">
        <div className="flex items-start justify-between gap-3 mb-1">
          <h3 className={`font-bold text-base sm:text-lg leading-snug ${
            isDark ? 'text-slate-100' : 'text-slate-800'
          }`}>
            {product.name}
          </h3>
          {!hasVariants && (
            <div
              className="text-base sm:text-lg font-extrabold whitespace-nowrap"
              style={{ color: accent }}
            >
              {formatTRY(product.price)}
            </div>
          )}
        </div>
        {product.description && (
          <p className={`text-xs sm:text-sm line-clamp-2 mb-2 ${
            isDark ? 'text-slate-400' : 'text-slate-500'
          }`}>
            {product.description}
          </p>
        )}
        {hasVariants && (
          <div className="mt-auto">
            <div className={`text-[11px] uppercase tracking-wide font-semibold mb-1.5 ${
              isDark ? 'text-slate-500' : 'text-slate-400'
            }`}>
              Başlangıç fiyatı:{' '}
              <span className="font-extrabold text-sm" style={{ color: accent }}>
                {formatTRY(minPrice)}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {variants
                .slice()
                .sort((a, b) => a.sort_order - b.sort_order)
                .slice(0, 6)
                .map(v => {
                  const final = product.price + Number(v.price_modifier || 0);
                  return (
                    <span
                      key={v.id}
                      className={`inline-flex items-center gap-1.5 text-[11px] rounded-full px-2.5 py-1 ${
                        isDark
                          ? 'bg-slate-800 border border-slate-700 text-slate-300'
                          : 'bg-slate-50 border border-slate-200 text-slate-700'
                      }`}
                    >
                      <span className="font-medium">{v.name}</span>
                      <span className="font-bold" style={{ color: accent }}>
                        {formatTRY(final)}
                      </span>
                    </span>
                  );
                })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function WaiterCallModal({
  tenantId,
  branchId,
  accent,
  isDark,
  onClose,
}: {
  tenantId: string;
  branchId: string;
  accent: string;
  isDark: boolean;
  onClose: () => void;
}) {
  const [tableLabel, setTableLabel] = useState<string>(() => {
    try {
      return localStorage.getItem(TABLE_LS_KEY) || '';
    } catch {
      return '';
    }
  });
  // İlk açılışta masa zaten kayıtlıysa direkt çağrı seçimine git
  const [step, setStep] = useState<'table' | 'pick'>(tableLabel.trim() ? 'pick' : 'table');
  const [submittingType, setSubmittingType] = useState<string | null>(null);
  const [done, setDone] = useState<{ type: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [showNote, setShowNote] = useState(false);
  const [message, setMessage] = useState('');

  const types: { id: 'service' | 'bill' | 'water' | 'help'; label: string; icon: any; gradient: string }[] = [
    { id: 'service', label: 'Garson', icon: Bell, gradient: 'from-orange-500 to-amber-500' },
    { id: 'bill', label: 'Hesap', icon: Receipt, gradient: 'from-emerald-500 to-teal-500' },
    { id: 'water', label: 'Su', icon: Droplets, gradient: 'from-sky-500 to-blue-500' },
    { id: 'help', label: 'Diğer', icon: HelpCircle, gradient: 'from-violet-500 to-purple-500' },
  ];

  const sendCall = async (callType: 'service' | 'bill' | 'water' | 'help') => {
    if (submittingType) return;
    if (!tableLabel.trim()) {
      setStep('table');
      setErr('Lütfen masa numarası / adını girin.');
      return;
    }
    setErr(null);
    setSubmittingType(callType);
    try {
      try { localStorage.setItem(TABLE_LS_KEY, tableLabel.trim()); } catch { /* ignore */ }
      await createWaiterCall({
        tenantId,
        branchId,
        tableLabel: tableLabel.trim(),
        callType,
        message: message.trim() || undefined,
      });
      setDone({ type: callType });
      setMessage('');
      setShowNote(false);
      setTimeout(onClose, 900);
    } catch (e: any) {
      setErr(e?.message || 'Çağrı gönderilemedi.');
    } finally {
      setSubmittingType(null);
    }
  };

  const tableValid = tableLabel.trim().length > 0;
  const doneType = done ? types.find(t => t.id === done.type) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4">
      <div className={`w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl border ${
        isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
      }`}>
        {done && doneType ? (
          <div className="p-8 text-center">
            <div
              className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 bg-gradient-to-br ${doneType.gradient} shadow-lg`}
            >
              <CheckCircle2 className="w-9 h-9 text-white" />
            </div>
            <h3 className={`text-xl font-extrabold mb-1 ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
              {doneType.label} çağrısı gönderildi!
            </h3>
            <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Masa <span className="font-bold">{tableLabel}</span> · garsonumuz hemen geliyor.
            </p>
          </div>
        ) : (
          <>
            <div className={`flex items-center justify-between px-5 py-4 border-b ${
              isDark ? 'border-slate-800' : 'border-slate-100'
            }`}>
              <div className="flex items-center gap-2 min-w-0">
                <Bell className="w-5 h-5 flex-shrink-0" style={{ color: accent }} />
                <h3 className={`font-extrabold text-lg truncate ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
                  Garson Çağır
                </h3>
                {step === 'pick' && tableLabel && (
                  <span className={`ml-1 text-xs font-bold px-2 py-0.5 rounded-full truncate max-w-[120px] ${
                    isDark ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-600'
                  }`} title={tableLabel}>
                    {tableLabel}
                  </span>
                )}
              </div>
              <button
                onClick={onClose}
                className={`p-1.5 rounded-lg flex-shrink-0 ${
                  isDark ? 'hover:bg-slate-800 text-slate-400' : 'hover:bg-slate-100 text-slate-500'
                }`}
                aria-label="Kapat"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {step === 'table' ? (
              <div className="p-5 space-y-4">
                <div>
                  <label className={`block text-xs font-semibold mb-1.5 ${
                    isDark ? 'text-slate-400' : 'text-slate-600'
                  }`}>
                    Masa Numarası / Adı
                  </label>
                  <input
                    type="text"
                    inputMode="text"
                    autoFocus
                    value={tableLabel}
                    onChange={e => { setTableLabel(e.target.value); setErr(null); }}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && tableValid) setStep('pick');
                    }}
                    placeholder="Örn. Masa 5 / Bahçe-3"
                    maxLength={60}
                    className={`w-full px-3 py-3 rounded-xl outline-none text-base font-semibold focus:ring-2 transition ${
                      isDark
                        ? 'bg-slate-800 text-slate-100 ring-1 ring-slate-700 focus:ring-slate-500 placeholder-slate-500'
                        : 'bg-slate-50 text-slate-800 ring-1 ring-slate-200 focus:ring-slate-300 placeholder-slate-400'
                    }`}
                  />
                  <p className={`text-[11px] mt-1.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                    Bir kere girin, cihazınızda kalır.
                  </p>
                </div>
                {err && (
                  <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    {err}
                  </div>
                )}
                <button
                  onClick={() => tableValid && setStep('pick')}
                  disabled={!tableValid}
                  className="w-full py-3 rounded-xl font-bold text-white shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition"
                  style={{ backgroundColor: accent }}
                >
                  Devam Et
                </button>
              </div>
            ) : (
              <div className="p-5 space-y-3">
                <div className="grid grid-cols-2 gap-2.5">
                  {types.map(t => {
                    const Icon = t.icon;
                    const isLoading = submittingType === t.id;
                    const isDisabled = !!submittingType && !isLoading;
                    return (
                      <button
                        key={t.id}
                        onClick={() => sendCall(t.id)}
                        disabled={isDisabled}
                        className={`relative overflow-hidden flex flex-col items-center justify-center gap-1.5 px-3 py-5 rounded-2xl text-white font-extrabold shadow-md bg-gradient-to-br ${t.gradient} active:scale-[0.97] transition-all disabled:opacity-50 disabled:cursor-not-allowed`}
                      >
                        {isLoading ? (
                          <Loader2 className="w-7 h-7 animate-spin" />
                        ) : (
                          <Icon className="w-7 h-7" />
                        )}
                        <span className="text-base">{t.label}</span>
                      </button>
                    );
                  })}
                </div>

                {!showNote ? (
                  <button
                    onClick={() => setShowNote(true)}
                    className={`text-xs font-semibold text-center w-full py-1.5 rounded-lg ${
                      isDark
                        ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                        : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    + Not Eklemek İstiyorum
                  </button>
                ) : (
                  <div>
                    <label className={`block text-xs font-semibold mb-1.5 ${
                      isDark ? 'text-slate-400' : 'text-slate-600'
                    }`}>
                      Not (isteğe bağlı)
                    </label>
                    <textarea
                      value={message}
                      onChange={e => setMessage(e.target.value)}
                      rows={2}
                      autoFocus
                      placeholder="Eklemek istediğiniz bir şey var mı?"
                      maxLength={280}
                      className={`w-full px-3 py-2.5 rounded-xl outline-none text-sm focus:ring-2 transition resize-none ${
                        isDark
                          ? 'bg-slate-800 text-slate-100 ring-1 ring-slate-700 focus:ring-slate-500 placeholder-slate-500'
                          : 'bg-slate-50 text-slate-800 ring-1 ring-slate-200 focus:ring-slate-300 placeholder-slate-400'
                      }`}
                    />
                    <p className={`text-[11px] mt-1 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                      Yukarıdaki düğmelerden birine basarak gönderin.
                    </p>
                  </div>
                )}

                <button
                  onClick={() => setStep('table')}
                  className={`text-[11px] font-semibold text-center w-full py-1 rounded ${
                    isDark ? 'text-slate-500 hover:text-slate-300' : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  Masa: {tableLabel} (değiştir)
                </button>

                {err && (
                  <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    {err}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ---------- helpers ----------
function resolveTheme(t: MenuTheme | null): ResolvedTheme {
  return {
    primary: t?.primary || PRIMARY_DEFAULT,
    accent: t?.accent || ACCENT_DEFAULT,
    mode: t?.mode === 'dark' ? 'dark' : 'light',
    fontStyle: t?.fontStyle || 'modern',
    heroStyle: t?.heroStyle || 'gradient',
    heroImageUrl: t?.heroImageUrl || null,
    showCategoryImages: t?.showCategoryImages ?? false,
  };
}

function fontFamilyClass(style: 'modern' | 'elegant' | 'casual'): string {
  // Tailwind default + system fallback
  if (style === 'elegant') return "[font-family:'Playfair_Display',Georgia,serif]";
  if (style === 'casual') return "[font-family:'Quicksand',system-ui,sans-serif]";
  return "[font-family:'Inter',system-ui,sans-serif]";
}

function formatTRY(n: number): string {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(n) || 0);
}

function shade(hex: string, percent: number): string {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const num = parseInt(h, 16);
  let r = (num >> 16) & 0xff;
  let g = (num >> 8) & 0xff;
  let b = num & 0xff;
  const f = 1 + percent / 100;
  r = Math.max(0, Math.min(255, Math.round(r * f)));
  g = Math.max(0, Math.min(255, Math.round(g * f)));
  b = Math.max(0, Math.min(255, Math.round(b * f)));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}
