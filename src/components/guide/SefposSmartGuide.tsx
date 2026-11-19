import { useEffect, useMemo, useState } from 'react';
import {
  Sparkles,
  X,
  Send,
  ChevronRight,
  Lightbulb,
  MessageCircle,
  Minimize2,
  BookOpen,
  EyeOff,
  Search,
  CheckCircle2,
  MapPin,
} from 'lucide-react';
import {
  GUIDE_ARTICLES,
  GUIDE_CATEGORIES,
  GUIDE_OPEN_EVENT,
  GUIDE_STARTER_QUESTIONS,
  articleForOnboardingStep,
  articlesForPage,
  isGuideFabHidden,
  matchGuideArticles,
  setGuideFabHidden,
  type GuideArticle,
} from '../../lib/sefposGuideKnowledge';

type Props = {
  onboardingStep?: number;
  currentPage?: string;
  embedded?: boolean;
  /** Kurulum sihirbazı: kısa tek satırlık rehber (ekrana sığsın) */
  compact?: boolean;
  className?: string;
  defaultOpen?: boolean;
};

type ChatLine = { role: 'user' | 'assistant'; text: string; article?: GuideArticle };
type TabId = 'assistant' | 'manual';

function articleToReply(a: GuideArticle): string {
  const steps = a.steps.map((s, i) => `${i + 1}. ${s}`).join('\n');
  const tips = a.tips.length ? `\n\nİpucu: ${a.tips[0]}` : '';
  return `${a.coach}\n\n${steps}${tips}`;
}

export function SefposSmartGuide({
  onboardingStep,
  currentPage,
  embedded = false,
  compact = false,
  className = '',
  defaultOpen = false,
}: Props) {
  const [open, setOpen] = useState(defaultOpen || embedded);
  const [minimized, setMinimized] = useState(false);
  const [fabHidden, setFabHidden] = useState(() => isGuideFabHidden());
  const [tab, setTab] = useState<TabId>('manual');
  const [query, setQuery] = useState('');
  const [manualSearch, setManualSearch] = useState('');
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [active, setActive] = useState<GuideArticle | null>(null);
  const [catFilter, setCatFilter] = useState<GuideArticle['category'] | 'all'>('all');
  const [checkedSteps, setCheckedSteps] = useState<Record<string, boolean>>({});

  const contextArticle = useMemo(() => {
    if (onboardingStep != null) return articleForOnboardingStep(onboardingStep);
    const list = articlesForPage(currentPage);
    return list[0] || GUIDE_ARTICLES[0];
  }, [onboardingStep, currentPage]);

  useEffect(() => {
    setActive(contextArticle || null);
    if (embedded && contextArticle) {
      setLines([
        {
          role: 'assistant',
          text: contextArticle.coach,
          article: contextArticle,
        },
      ]);
    }
  }, [contextArticle, embedded]);

  useEffect(() => {
    const onPref = (e: Event) => {
      const d = (e as CustomEvent).detail as { hidden?: boolean } | undefined;
      if (typeof d?.hidden === 'boolean') setFabHidden(d.hidden);
      else setFabHidden(isGuideFabHidden());
    };
    const onOpen = (e: Event) => {
      const d = (e as CustomEvent).detail as { tab?: TabId } | undefined;
      // Yüzen FAB kapalı kalsın; panel üst menüden açılır
      setOpen(true);
      setMinimized(false);
      if (d?.tab) setTab(d.tab);
    };
    window.addEventListener('sefpos-guide-pref', onPref);
    window.addEventListener(GUIDE_OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener('sefpos-guide-pref', onPref);
      window.removeEventListener(GUIDE_OPEN_EVENT, onOpen);
    };
  }, []);

  const ask = (raw: string) => {
    const q = raw.trim();
    if (!q) return;
    const matches = matchGuideArticles(q, 3);
    const best = matches[0];
    const reply = best
      ? articleToReply(best)
      : 'Bu konuda net bir madde bulamadım. Kullanım Kılavuzu sekmesinden konuyu seçebilir veya “ürün”, “stok grubu”, “masa” yazabilirsiniz.';
    setLines((prev) => [
      ...prev,
      { role: 'user', text: q },
      { role: 'assistant', text: reply, article: best },
    ]);
    if (best) setActive(best);
    setQuery('');
    setTab('assistant');
  };

  const suggestions = useMemo(() => {
    if (onboardingStep != null) return GUIDE_STARTER_QUESTIONS.slice(0, 3);
    return GUIDE_STARTER_QUESTIONS;
  }, [onboardingStep]);

  const manualList = useMemo(() => {
    let list = GUIDE_ARTICLES;
    if (catFilter !== 'all') list = list.filter((a) => a.category === catFilter);
    if (manualSearch.trim()) {
      const hits = matchGuideArticles(manualSearch, 20);
      const ids = new Set(hits.map((h) => h.id));
      list = list.filter((a) => ids.has(a.id));
    }
    return list;
  }, [catFilter, manualSearch]);

  const hideFab = () => {
    setGuideFabHidden(true);
    setFabHidden(true);
    setOpen(false);
    setMinimized(false);
  };

  if (embedded) {
    const a = active || contextArticle;
    if (!a) return null;
    if (compact) {
      return (
        <div
          className={`rounded-xl sm:rounded-2xl border border-orange-200/80 bg-orange-50/90 px-3 py-2.5 sm:px-4 sm:py-3 text-left ${className}`}
        >
          <div className="flex items-start gap-2.5 sm:gap-3">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-gradient-to-br from-orange-500 to-red-600 text-white flex items-center justify-center shrink-0 shadow-sm">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] sm:text-xs font-black text-slate-800 mb-0.5">
                ŞefPOS Asistan
                <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700">
                  Rehber
                </span>
              </p>
              <p className="text-xs sm:text-sm text-slate-700 leading-snug line-clamp-2 sm:line-clamp-3">
                {a.coach}
              </p>
            </div>
          </div>
        </div>
      );
    }
    return (
      <div
        className={`rounded-2xl border border-orange-200/80 bg-gradient-to-br from-orange-50 via-white to-amber-50 p-4 text-left shadow-sm ${className}`}
      >
        <div className="flex items-start gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-red-600 text-white flex items-center justify-center shrink-0 shadow">
            <Sparkles className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="font-black text-slate-800 text-sm">ŞefPOS Asistan</p>
              <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700">
                Rehber
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">{a.title}</p>
          </div>
        </div>
        <p className="text-sm text-slate-700 leading-relaxed mb-3">{a.coach}</p>
        <ul className="space-y-1.5 mb-3">
          {a.steps.slice(0, 4).map((s) => (
            <li key={s} className="flex gap-2 text-xs text-slate-600">
              <ChevronRight className="w-3.5 h-3.5 text-orange-500 shrink-0 mt-0.5" />
              <span>{s}</span>
            </li>
          ))}
        </ul>
        {a.tips[0] && (
          <div className="flex gap-2 rounded-xl bg-white/80 border border-orange-100 px-3 py-2 text-xs text-amber-900">
            <Lightbulb className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
            <span>{a.tips[0]}</span>
          </div>
        )}
        <p className="text-[11px] text-slate-400 mt-3">
          Kurulumdan sonra sağ alttaki Rehber’den kullanım kılavuzunu açabilir veya kapatabilirsiniz.
        </p>
      </div>
    );
  }

  const onTablesPage = currentPage === 'tables';
  /** Masa ekranı: mobilde sağdaki sütun/büyüt FAB ile, masaüstünde alt bilgi şeridi ile çakışmasın */
  const dockFabClass = onTablesPage
    ? 'fixed z-[80] left-3 right-auto bottom-[calc(0.75rem+env(safe-area-inset-bottom,0px))] md:left-auto md:right-5 md:bottom-14'
    : 'fixed z-[80] right-4 bottom-[calc(1.25rem+env(safe-area-inset-bottom,0px))] sm:right-5';
  const dockPanelClass = onTablesPage
    ? 'fixed z-[80] left-3 right-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom,0px))] md:left-auto md:right-5 md:bottom-14 w-auto md:w-[min(100vw-1.5rem,420px)] max-h-[min(68vh,560px)] md:max-h-[min(82vh,640px)]'
    : 'fixed z-[80] left-3 right-3 sm:left-auto sm:right-5 bottom-[calc(1.25rem+env(safe-area-inset-bottom,0px))] w-auto sm:w-[min(100vw-1.5rem,420px)] max-h-[min(82vh,640px)]';

  return (
    <>
      {!open && !fabHidden && (
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            setMinimized(false);
            setTab('manual');
          }}
          className={`${dockFabClass} flex items-center gap-2 rounded-full bg-gradient-to-r from-orange-500 to-red-600 text-white pl-3 pr-4 py-3 shadow-xl hover:shadow-2xl hover:scale-[1.02] transition font-bold text-sm`}
          aria-label="ŞefPOS rehber ve kılavuz"
        >
          <span className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
            <BookOpen className="w-4 h-4" />
          </span>
          Rehber
        </button>
      )}

      {open && !minimized && (
        <div
          className={`${dockPanelClass} flex flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden ${className}`}
        >
          <div className="bg-gradient-to-r from-orange-500 to-red-600 px-4 py-3 flex items-center gap-2 text-white">
            <BookOpen className="w-5 h-5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-black text-sm leading-tight">ŞefPOS Rehber</p>
              <p className="text-[11px] text-white/80 truncate">Asistan + kullanım kılavuzu</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setMinimized(false);
                setGuideFabHidden(true);
                setFabHidden(true);
              }}
              className="p-1.5 rounded-lg hover:bg-white/15"
              title="Kapat"
              aria-label="Kapat"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex border-b border-slate-100">
            <button
              type="button"
              onClick={() => setTab('manual')}
              className={`flex-1 py-2.5 text-xs font-bold flex items-center justify-center gap-1.5 ${
                tab === 'manual' ? 'text-orange-700 border-b-2 border-orange-500 bg-orange-50/50' : 'text-slate-500'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              Kullanım kılavuzu
            </button>
            <button
              type="button"
              onClick={() => setTab('assistant')}
              className={`flex-1 py-2.5 text-xs font-bold flex items-center justify-center gap-1.5 ${
                tab === 'assistant' ? 'text-orange-700 border-b-2 border-orange-500 bg-orange-50/50' : 'text-slate-500'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              Asistan
            </button>
          </div>

          {tab === 'manual' ? (
            <div className="flex-1 overflow-hidden flex flex-col min-h-[280px]">
              <div className="p-3 border-b border-slate-100 space-y-2">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    value={manualSearch}
                    onChange={(e) => setManualSearch(e.target.value)}
                    placeholder="Kılavuzda ara…"
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-orange-400"
                  />
                </div>
                <div className="flex gap-1 overflow-x-auto pb-0.5">
                  <button
                    type="button"
                    onClick={() => setCatFilter('all')}
                    className={`shrink-0 text-[11px] px-2.5 py-1 rounded-full border ${
                      catFilter === 'all' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200'
                    }`}
                  >
                    Tümü
                  </button>
                  {GUIDE_CATEGORIES.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setCatFilter(c.id)}
                      className={`shrink-0 text-[11px] px-2.5 py-1 rounded-full border ${
                        catFilter === c.id ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-slate-600 border-slate-200'
                      }`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto">
                {!active || !manualList.find((x) => x.id === active.id) ? (
                  <ul className="divide-y divide-slate-100">
                    {manualList.map((a) => (
                      <li key={a.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setActive(a);
                            setCheckedSteps({});
                          }}
                          className="w-full text-left px-4 py-3 hover:bg-orange-50/60 transition"
                        >
                          <p className="font-bold text-sm text-slate-800">{a.title}</p>
                          <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{a.summary}</p>
                          {a.menuPath && (
                            <p className="text-[11px] text-orange-600 mt-1 flex items-center gap-1">
                              <MapPin className="w-3 h-3" />
                              {a.menuPath}
                            </p>
                          )}
                        </button>
                      </li>
                    ))}
                    {!manualList.length && (
                      <li className="px-4 py-8 text-center text-sm text-slate-400">Sonuç yok. Başka kelime deneyin.</li>
                    )}
                  </ul>
                ) : (
                  <div className="p-4">
                    <button
                      type="button"
                      onClick={() => setActive(null)}
                      className="text-xs font-semibold text-orange-600 hover:text-orange-700 mb-3"
                    >
                      ← Konu listesine dön
                    </button>
                    <h3 className="text-lg font-black text-slate-800 mb-1">{active.title}</h3>
                    <p className="text-sm text-slate-500 mb-3">{active.summary}</p>
                    {active.menuPath && (
                      <div className="mb-3 rounded-xl bg-slate-50 border border-slate-100 px-3 py-2 text-xs text-slate-600 flex gap-2">
                        <MapPin className="w-3.5 h-3.5 text-orange-500 shrink-0 mt-0.5" />
                        <span>
                          <span className="font-bold text-slate-700">Menü yolu: </span>
                          {active.menuPath}
                        </span>
                      </div>
                    )}
                    <p className="text-sm text-slate-700 leading-relaxed mb-3">{active.coach}</p>
                    {(active.manual || []).map((p) => (
                      <p key={p} className="text-sm text-slate-600 leading-relaxed mb-2">
                        {p}
                      </p>
                    ))}
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-400 mt-4 mb-2">
                      Adım adım uygulayın
                    </p>
                    <ul className="space-y-2 mb-4">
                      {active.steps.map((s, i) => {
                        const key = `${active.id}-${i}`;
                        const done = !!checkedSteps[key];
                        return (
                          <li key={key}>
                            <button
                              type="button"
                              onClick={() => setCheckedSteps((p) => ({ ...p, [key]: !p[key] }))}
                              className={`w-full flex gap-2 items-start text-left rounded-xl border px-3 py-2.5 text-sm transition ${
                                done
                                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                                  : 'bg-white border-slate-200 text-slate-700 hover:border-orange-200'
                              }`}
                            >
                              <CheckCircle2
                                className={`w-4 h-4 shrink-0 mt-0.5 ${done ? 'text-emerald-600' : 'text-slate-300'}`}
                              />
                              <span>
                                <span className="font-bold text-xs text-slate-400 mr-1">{i + 1}.</span>
                                {s}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                    {active.tips.map((t) => (
                      <div
                        key={t}
                        className="flex gap-2 rounded-xl bg-amber-50 border border-amber-100 px-3 py-2 text-xs text-amber-900 mb-2"
                      >
                        <Lightbulb className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                        <span>{t}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <>
              <div className="px-3 pt-2 flex gap-1.5 overflow-x-auto pb-2 border-b border-slate-100">
                {(contextArticle
                  ? [contextArticle, ...GUIDE_ARTICLES.filter((x) => x.id !== contextArticle.id)]
                  : GUIDE_ARTICLES
                )
                  .slice(0, 8)
                  .map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => {
                        setActive(a);
                        setLines((prev) => [
                          ...prev,
                          { role: 'assistant', text: articleToReply(a), article: a },
                        ]);
                      }}
                      className={`shrink-0 text-[11px] px-2.5 py-1 rounded-full border transition ${
                        active?.id === a.id
                          ? 'bg-orange-50 border-orange-300 text-orange-800 font-semibold'
                          : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      {a.title}
                    </button>
                  ))}
              </div>

              <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 min-h-[200px]">
                {lines.length === 0 && active && (
                  <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
                    <div className="flex items-center gap-2 text-orange-600 mb-2">
                      <MessageCircle className="w-4 h-4" />
                      <span className="text-xs font-bold uppercase tracking-wide">Bu ekran için</span>
                    </div>
                    <p className="text-sm text-slate-700 leading-relaxed">{active.coach}</p>
                    <button
                      type="button"
                      onClick={() => setTab('manual')}
                      className="mt-3 text-xs font-bold text-orange-600 hover:underline"
                    >
                      Tam kılavuz maddesini aç →
                    </button>
                  </div>
                )}
                {lines.map((line, idx) => (
                  <div
                    key={idx}
                    className={`text-sm whitespace-pre-wrap leading-relaxed rounded-xl px-3 py-2 ${
                      line.role === 'user'
                        ? 'bg-orange-500 text-white ml-8'
                        : 'bg-slate-50 text-slate-700 border border-slate-100 mr-4'
                    }`}
                  >
                    {line.text}
                  </div>
                ))}
              </div>

              <div className="px-3 pb-2 flex flex-wrap gap-1.5">
                {suggestions.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => ask(q)}
                    className="text-[11px] px-2 py-1 rounded-full bg-amber-50 text-amber-900 border border-amber-100 hover:bg-amber-100 transition"
                  >
                    {q}
                  </button>
                ))}
              </div>

              <form
                className="p-3 border-t border-slate-100 flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  ask(query);
                }}
              >
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Örn: stok grubu nedir?"
                  className="flex-1 px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-orange-400"
                />
                <button
                  type="submit"
                  className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-red-600 text-white flex items-center justify-center shrink-0"
                  aria-label="Gönder"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </>
          )}

          <div className="px-3 py-2 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-2">
            <p className="text-[10px] text-slate-400 leading-snug">
              İstemiyorsanız rehberi gizleyebilirsiniz. Üst menüden tekrar açılır.
            </p>
            <button
              type="button"
              onClick={hideFab}
              className="shrink-0 inline-flex items-center gap-1 text-[11px] font-bold text-slate-600 hover:text-slate-900 px-2 py-1.5 rounded-lg hover:bg-white border border-transparent hover:border-slate-200"
            >
              <EyeOff className="w-3.5 h-3.5" />
              Rehberi kapat
            </button>
          </div>
        </div>
      )}

      {open && minimized && !fabHidden && (
        <button
          type="button"
          onClick={() => setMinimized(false)}
          className={`${dockFabClass} flex items-center gap-2 rounded-full bg-slate-900 text-white pl-3 pr-4 py-3 shadow-xl font-bold text-sm`}
        >
          <BookOpen className="w-4 h-4 text-orange-400" />
          Rehber
        </button>
      )}
    </>
  );
}
