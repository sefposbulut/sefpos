import { useState, useEffect, useRef, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
  Printer, Plus, Trash2, Save, RefreshCw, CheckCircle, XCircle,
  ToggleLeft, ToggleRight, Settings2, AlertCircle, X, ChevronDown, Wifi, WifiOff,
  ArrowLeft, ChefHat, Receipt, ShoppingBag, LayoutGrid, Link2, Globe,
} from 'lucide-react';
import {
  PrinterDevice, PrinterConfig, PrintSettings, PrintStyleSettings, PrintAgentStatus,
  loadPrintSettings, savePrintSettings, getAvailablePrinters,
  isElectron, checkPrintAgent, checkPrintAgentDetailed, printHtml,
  getKitchenRoutePrinters, resolveCategoryPrinter, assignCategoryToKitchenPrinter,
  PRINT_SETTINGS_CONTEXT_EVENT,
  PRINT_SETTINGS_REMOTE_UPDATED_EVENT,
} from '../lib/printService';
import { ReceiptThermalPreview } from './print/ReceiptThermalPreview';
import { ReceiptEdgeAlignPanel } from './print/ReceiptEdgeAlignPanel';
import { ReceiptLiveStylePanel, type ReceiptEditorKind } from './print/ReceiptLiveStylePanel';
import { previewAdisyonHtml, previewKitchenHtml, previewPaketHtml } from './print/receiptPreviewUtils';

type PrinterSettingsView =
  | 'hub'
  | 'kitchen'
  | 'adisyon'
  | 'paket'
  | 'genel'
  | 'online'
  | 'yazicilar'
  | 'kategori';

interface Category {
  id: string;
  name: string;
}

const PRINTER_TYPES = [
  { value: 'kitchen', label: 'Mutfak', color: 'bg-orange-100 text-orange-700' },
  { value: 'bar', label: 'Bar / İçecek', color: 'bg-blue-100 text-blue-700' },
  { value: 'receipt', label: 'Fiş / Kasa', color: 'bg-green-100 text-green-700' },
  { value: 'takeaway', label: 'Paket / Kurye', color: 'bg-amber-100 text-amber-700' },
  { value: 'custom', label: 'Özel', color: 'bg-slate-100 text-slate-700' },
];

export function PrinterSettings() {
  const { tenant, activeBranch } = useAuth();
  const [view, setView] = useState<PrinterSettingsView>('hub');
  const [settings, setSettings] = useState<PrintSettings>(loadPrintSettings());
  const [availablePrinters, setAvailablePrinters] = useState<PrinterDevice[]>([]);
  const [loadingPrinters, setLoadingPrinters] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [showAddPrinter, setShowAddPrinter] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testResult, setTestResult] = useState<string>('');
  const [expandedPrinter, setExpandedPrinter] = useState<number | null>(null);
  const [agentConnected, setAgentConnected] = useState<boolean | null>(null);
  const [agentStatus, setAgentStatus] = useState<PrintAgentStatus | null>(null);
  const [agentDetail, setAgentDetail] = useState<string | undefined>(undefined);
  const [checkingAgent, setCheckingAgent] = useState(false);

  const [newPrinter, setNewPrinter] = useState<Omit<PrinterConfig, 'printerName'> & { printerName: string }>({
    printerName: '',
    label: '',
    type: 'kitchen',
    categoryIds: [],
    enabled: true,
  });

  useEffect(() => {
    const saved = loadPrintSettings();
    setSettings(saved);
    loadCategories();
    if (isElectron()) {
      fetchPrinters();
      return;
    }

    let lastStatus: boolean | null = null;

    const checkAgent = async () => {
      const result = await checkPrintAgentDetailed();
      setAgentConnected(result.connected);
      setAgentStatus(result.status);
      setAgentDetail(result.detail);
      if (result.connected && lastStatus !== true) {
        fetchPrinters();
      }
      lastStatus = result.connected;
    };

    checkAgent();
    const interval = setInterval(checkAgent, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (tenant && !settings.restaurantName) {
      setSettings(prev => ({ ...prev, restaurantName: tenant.name || '' }));
    }
  }, [tenant]);

  // Auto-save: settings her degistiginde localStorage'a kaydet.
  // Boylece kategori -> yazici eslemesi, varsayilan yazici, vb. tum
  // degisiklikler ek bir "Kaydet" tiklamasi gerektirmeden hemen aktif olur
  // ve OrderPanel bir sonraki loadPrintSettings() cagrisinda yeni esleme ile
  // mutfak fisi gonderir.
  const skipFirstAutoSave = useRef(true);
  useEffect(() => {
    if (skipFirstAutoSave.current) {
      skipFirstAutoSave.current = false;
      return;
    }
    savePrintSettings(settings);
  }, [settings]);

  // Tenant veya şube değişirse (kullanıcı sağ üstten şube değiştirdi vb.)
  // localStorage anahtarı dinamik olarak değişir; ayarları ve KATEGORİLERİ
  // yeniden yükleyerek başka tenant/branch ile karışmasını önle.
  useEffect(() => {
    const refreshFromCache = () => {
      skipFirstAutoSave.current = true; // taze yüklemeyi auto-save tetiklemesin
      setSettings(loadPrintSettings());
      // Kategoriler de tenant bazlı — başka tenant'ın kategorileri ekranda
      // kalmasın diye onları da tazeliyoruz.
      void loadCategories();
    };
    window.addEventListener(PRINT_SETTINGS_CONTEXT_EVENT, refreshFromCache);
    // Buluttan başka bir cihazda (Electron kasa, web vb.) yapılan ayar
    // değişikliği indirildiğinde de formu tazele.
    window.addEventListener(PRINT_SETTINGS_REMOTE_UPDATED_EVENT, refreshFromCache);
    return () => {
      window.removeEventListener(PRINT_SETTINGS_CONTEXT_EVENT, refreshFromCache);
      window.removeEventListener(PRINT_SETTINGS_REMOTE_UPDATED_EVENT, refreshFromCache);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant?.id, activeBranch?.id]);

  const loadCategories = async () => {
    if (!tenant) return;
    const { data } = await supabase.from('categories').select('id, name').eq('tenant_id', tenant.id).order('sort_order');
    setCategories(data || []);
  };

  const fetchPrinters = async () => {
    setLoadingPrinters(true);
    const list = await getAvailablePrinters();
    setAvailablePrinters(list);
    setLoadingPrinters(false);
  };

  const handleSave = () => {
    savePrintSettings(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const addPrinter = () => {
    if (!newPrinter.printerName) return;
    const config: PrinterConfig = {
      printerName: newPrinter.printerName,
      label: newPrinter.label || newPrinter.printerName,
      type: newPrinter.type as PrinterConfig['type'],
      categoryIds: newPrinter.categoryIds,
      enabled: true,
    };
    setSettings(prev => ({ ...prev, printers: [...prev.printers, config] }));
    setNewPrinter({ printerName: '', label: '', type: 'kitchen', categoryIds: [], enabled: true });
    setShowAddPrinter(false);
  };

  const removePrinter = (index: number) => {
    setSettings(prev => ({ ...prev, printers: prev.printers.filter((_, i) => i !== index) }));
    if (expandedPrinter === index) setExpandedPrinter(null);
  };

  const updatePrinter = (index: number, updates: Partial<PrinterConfig>) => {
    setSettings(prev => ({
      ...prev,
      printers: prev.printers.map((p, i) => i === index ? { ...p, ...updates } : p),
    }));
  };

  const patchPrintStyle = (partial: Partial<PrintStyleSettings>) => {
    setSettings((p) => ({
      ...p,
      printStyle: { ...p.printStyle, ...partial },
    }));
  };

  const toggleCategory = (printerIndex: number, categoryId: string) => {
    const printer = settings.printers[printerIndex];
    const has = printer.categoryIds.includes(categoryId);
    updatePrinter(printerIndex, {
      categoryIds: has
        ? printer.categoryIds.filter(id => id !== categoryId)
        : [...printer.categoryIds, categoryId],
    });
  };

  const resolveDefaultPrinter = (kind: 'kitchen' | 'receipt' | 'takeaway'): string => {
    if (kind === 'receipt') return settings.defaultReceiptPrinter || '';
    if (kind === 'takeaway') {
      const typed = settings.printers.find((p) => p.enabled && p.type === 'takeaway');
      return typed?.printerName || settings.defaultTakeawayPrinter || settings.defaultReceiptPrinter || '';
    }
    const typed = settings.printers.find((p) => p.enabled && (p.type === 'kitchen' || p.type === 'bar'));
    return typed?.printerName || settings.defaultKitchenPrinter || settings.defaultOnlinePlatformPrinter || '';
  };

  const previewHtmlForKind = (kind: 'kitchen' | 'receipt' | 'takeaway') => {
    if (kind === 'receipt') return previewAdisyonHtml(settings);
    if (kind === 'takeaway') return previewPaketHtml(settings);
    return previewKitchenHtml(settings);
  };

  const handleTestPrint = async (printerName: string, type: string) => {
    const kind =
      type === 'receipt' ? 'receipt' : type === 'takeaway' ? 'takeaway' : 'kitchen';
    await runPreviewTestPrint(kind, printerName);
  };

  const runPreviewTestPrint = async (
    kind: 'kitchen' | 'receipt' | 'takeaway',
    printerName?: string,
  ) => {
    setTestResult('Gönderiliyor...');
    const html = previewHtmlForKind(kind);
    const target = printerName || resolveDefaultPrinter(kind);
    const result = await printHtml(html, target);
    setTestResult(
      result.success
        ? 'Test fişi gönderildi!'
        : `Hata: ${result.error || 'Yazıcı seçilmedi'}`,
    );
    setTimeout(() => setTestResult(''), 4000);
  };

  const hubNavBtn = (
    id: PrinterSettingsView,
    label: string,
    icon: ReactNode,
    desc: string,
  ) => (
    <button
      key={id}
      type="button"
      onClick={() => setView(id)}
      className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 bg-white hover:border-orange-300 hover:bg-orange-50/40 text-left transition"
    >
      <span className="mt-0.5 text-orange-600">{icon}</span>
      <span>
        <span className="block text-sm font-bold text-slate-800">{label}</span>
        <span className="block text-[11px] text-slate-500 mt-0.5">{desc}</span>
      </span>
    </button>
  );

  const viewTitle: Record<PrinterSettingsView, string> = {
    hub: 'Fiş & Yazıcı',
    kitchen: 'Mutfak fişi',
    adisyon: 'Adisyon fişi',
    paket: 'Paket / kurye fişi',
    genel: 'Restoran bilgileri',
    online: 'Online platform fişi',
    yazicilar: 'Yazıcı listesi',
    kategori: 'Kategori → yazıcı',
  };

  const typeInfo = (type: string) => PRINTER_TYPES.find(t => t.value === type) || PRINTER_TYPES[3];

  return (
    <div className="space-y-5">
      <div className="bg-gradient-to-r from-orange-500 to-red-600 rounded-xl p-4 md:p-6 text-white">
        <div className="flex items-center gap-3 mb-2">
          <Printer className="w-6 h-6" />
          <h3 className="text-lg md:text-2xl font-bold">{viewTitle[view]}</h3>
        </div>
        <p className="text-orange-50 text-sm">
          {view === 'hub' ? (
            <>
              Mutfak, adisyon ve paket fişlerini <strong className="text-white">önizleyip</strong> kartlara tıklayarak düzenleyin.
              Yazıcı listesi ve kategori eşlemesi de bu menüdedir.
            </>
          ) : (
            <>
              Mutfak fişleri <strong className="text-white">Mutfak / Bar / Özel</strong> yazıcılara gider.
              <strong className="text-white"> Adisyon</strong> ve <strong className="text-white">paket</strong> fişi ayrı yazıcılardan çıkar.
            </>
          )}
        </p>
        <p className="text-orange-50/90 text-xs mt-3 border-t border-white/20 pt-3">
          Bu ekrandaki yazıcı eşlemeleri, fiş metinleri ve otomatik yazdırma seçenekleri hesabınızdaki{' '}
          <strong className="text-white">işletme + şube</strong> için bulutta saklanır; başka bilgisayardan veya telefondan giriş yaptığınızda aynı ayarlar gelir.
          İnternet kesilirse ayarlar bu cihazda kalır; bağlantı gelince yeniden senkronize edilir.
        </p>
      </div>

      {!isElectron() && agentConnected === true && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-start gap-3">
          <Wifi className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-green-800">Print Agent Bağlı</p>
            <p className="text-sm text-green-700">
              {agentDetail?.includes('Supabase')
                ? 'Yazma işleri Supabase Realtime kanalı üzerinden masaüstü uygulamaya iletilecek. HTTPS ortamında sorunsuz çalışır.'
                : 'ŞefPOS masaüstü uygulaması arka planda çalışıyor. Web üzerinden yazıcılar kullanılabilir durumda.'
              }
            </p>
          </div>
        </div>
      )}
      {!isElectron() && agentConnected === false && agentStatus !== null && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
          <div className="flex items-start gap-3">
            <WifiOff className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-bold text-amber-800">Print Agent Bağlı Değil</p>
              {agentStatus === 'blocked_mixed_content' ? (
                <div className="mt-1 space-y-2">
                  <p className="text-sm text-amber-700 font-semibold">Tarayıcı güvenlik politikası HTTP isteğini engelliyor (Mixed Content).</p>
                  <p className="text-sm text-amber-700">Bu sayfa HTTPS üzerinden açıldığı için tarayıcı, HTTP üzerindeki Print Agent'a bağlanmayı reddediyor.</p>
                  <div className="bg-amber-100 rounded-lg p-3 text-xs text-amber-800 space-y-1.5">
                    <p className="font-bold">Çözüm seçenekleri:</p>
                    <p>1. Chrome adres çubuğuna <code className="bg-amber-200 px-1 rounded">chrome://flags/#unsafely-treat-insecure-origin-as-secure</code> yaz, <code className="bg-amber-200 px-1 rounded">http://127.0.0.1:7878</code> ekle ve Chrome'u yeniden başlat.</p>
                    <p>2. Siteyi HTTP üzerinden aç: <code className="bg-amber-200 px-1 rounded">http://</code> ile başlayan adresi kullan.</p>
                    <p>3. ŞefPOS masaüstü uygulamasını kullan (HTTPS sorunu olmaz).</p>
                  </div>
                </div>
              ) : agentStatus === 'not_running' ? (
                <div className="text-sm text-amber-700 mt-1 space-y-1.5">
                  <p>
                    <strong className="text-amber-900">Getir / Yemeksepeti / Trendyol</strong> gibi online sipariş fişleri bu
                    bilgisayarda <strong className="text-amber-900">tarayıcı yazdırma penceresi</strong> ile çıkabilir (Electron
                    kurmadan, Getir paneli gibi). Masa ve mutfak fişleri kasadaki ŞefPOS veya Print Agent üzerinden basılır.
                  </p>
                  <p className="text-xs text-amber-600">
                    Uzaktan (telefon) sipariş alıyorsanız ve fiş başka kasada basılacaksa bu PC’de ŞefPOS masaüstü veya{' '}
                    <code className="bg-amber-200 px-1 rounded">npm run print-agent</code> açık olmalıdır.
                  </p>
                </div>
              ) : (
                <p className="text-sm text-amber-700 mt-1">Bağlantı kurulamadı. {agentDetail && <span className="font-mono text-xs">({agentDetail})</span>}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3 pl-8">
            <button
              onClick={async () => {
                setCheckingAgent(true);
                const result = await checkPrintAgentDetailed();
                setAgentConnected(result.connected);
                setAgentStatus(result.status);
                setAgentDetail(result.detail);
                if (result.connected) fetchPrinters();
                setCheckingAgent(false);
              }}
              disabled={checkingAgent}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${checkingAgent ? 'animate-spin' : ''}`} />
              {checkingAgent ? 'Kontrol ediliyor...' : 'Tekrar Dene'}
            </button>
            <a
              href="http://127.0.0.1:7878/status"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-amber-700 underline hover:text-amber-900"
            >
              Tarayıcıda test et
            </a>
          </div>
        </div>
      )}

      {view !== 'hub' && (
        <button
          type="button"
          onClick={() => setView('hub')}
          className="flex items-center gap-2 text-sm font-semibold text-orange-700 hover:text-orange-900"
        >
          <ArrowLeft className="w-4 h-4" />
          Fiş & yazıcı menüsüne dön
        </button>
      )}

      {view === 'hub' && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {([
              {
                id: 'kitchen' as const,
                title: 'Mutfak fişi',
                sub: 'Sipariş gönderince mutfağa',
                icon: <ChefHat className="w-5 h-5" />,
                accent: 'border-orange-200 hover:border-orange-400 ring-orange-100',
                html: previewKitchenHtml(settings),
              },
              {
                id: 'adisyon' as const,
                title: 'Adisyon fişi',
                sub: 'Ödeme / müşteri fişi',
                icon: <Receipt className="w-5 h-5" />,
                accent: 'border-emerald-200 hover:border-emerald-400 ring-emerald-100',
                html: previewAdisyonHtml(settings),
              },
              {
                id: 'paket' as const,
                title: 'Paket / kurye fişi',
                sub: 'Paket servis ve teslimat',
                icon: <ShoppingBag className="w-5 h-5" />,
                accent: 'border-amber-200 hover:border-amber-400 ring-amber-100',
                html: previewPaketHtml(settings),
              },
            ]).map((card) => (
              <button
                key={card.id}
                type="button"
                onClick={() => setView(card.id)}
                className={`text-left rounded-2xl border-2 bg-white p-3 transition shadow-sm hover:shadow-md hover:ring-2 ${card.accent}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="flex items-center gap-2 text-sm font-bold text-slate-800">
                    {card.icon}
                    {card.title}
                  </span>
                  <span className="text-[10px] font-bold uppercase text-orange-600">Ayarla →</span>
                </div>
                <ReceiptThermalPreview
                  html={card.html}
                  size="card"
                  offsetMm={
                    card.id === 'paket'
                      ? settings.printStyle.paperOffsetMm - 1
                      : settings.printStyle.paperOffsetMm
                  }
                />
                <p className="text-[11px] text-slate-500 mt-2">{card.sub}</p>
              </button>
            ))}
          </div>

          <ReceiptEdgeAlignPanel
            settings={settings}
            patchPrintStyle={patchPrintStyle}
            accent="orange"
          />

          <div className="bg-white rounded-xl border border-slate-200 p-4 md:p-5">
            <h4 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
              <LayoutGrid className="w-4 h-4 text-slate-500" />
              Diğer ayarlar
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
              {hubNavBtn('yazicilar', 'Yazıcı listesi', <Printer className="w-4 h-4" />, 'Ekle, tür seç, test yazdır')}
              {hubNavBtn('kategori', 'Kategori eşleme', <Link2 className="w-4 h-4" />, 'Hangi ürün hangi mutfağa')}
              {hubNavBtn('genel', 'Restoran bilgileri', <Settings2 className="w-4 h-4" />, 'Başlık, adres, alt yazı')}
              {hubNavBtn('online', 'Online sipariş fişi', <Globe className="w-4 h-4" />, 'Getir / YS / Trendyol')}
            </div>
          </div>
        </>
      )}

      {(view === 'kitchen' || view === 'adisyon' || view === 'paket') && (() => {
        const editorKind = view as ReceiptEditorKind;
        const previewHtml =
          view === 'kitchen'
            ? previewKitchenHtml(settings)
            : view === 'adisyon'
              ? previewAdisyonHtml(settings)
              : previewPaketHtml(settings);
        const offsetMm =
          view === 'paket' ? settings.printStyle.paperOffsetMm - 1 : settings.printStyle.paperOffsetMm;
        const borderCls =
          view === 'adisyon'
            ? 'border-emerald-200'
            : view === 'paket'
              ? 'border-amber-200'
              : 'border-orange-200';

        return (
          <div className="space-y-4">
            <ReceiptEdgeAlignPanel
              settings={settings}
              patchPrintStyle={patchPrintStyle}
              accent={view === 'adisyon' ? 'emerald' : view === 'paket' ? 'amber' : 'orange'}
              paketExtraMm={view === 'paket' ? -1 : 0}
            />

            <div className="grid grid-cols-1 2xl:grid-cols-12 gap-5">
              <div className="2xl:col-span-8 space-y-4">
                <ReceiptThermalPreview size="editor" offsetMm={offsetMm} html={previewHtml} />

                <ReceiptLiveStylePanel
                  kind={editorKind}
                  settings={settings}
                  patchPrintStyle={patchPrintStyle}
                  onRestaurantPatch={(p) => setSettings((prev) => ({ ...prev, ...p }))}
                />

                <button
                  type="button"
                  onClick={() =>
                    void runPreviewTestPrint(
                      view === 'adisyon' ? 'receipt' : view === 'paket' ? 'takeaway' : 'kitchen',
                    )
                  }
                  className="w-full py-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-base font-bold transition shadow-lg"
                >
                  Yazıcıya test gönder
                </button>
              </div>

              <div className={`2xl:col-span-4 space-y-4 bg-white rounded-xl border-2 ${borderCls} p-4 md:p-5 shadow-sm`}>
                <h4 className="font-bold text-slate-800 border-b border-slate-100 pb-2">Yazıcı ve otomasyon</h4>

                {view === 'kitchen' && (
                  <>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.printStyle.showKitchenOrderNumber}
                        onChange={(e) => patchPrintStyle({ showKitchenOrderNumber: e.target.checked })}
                        className="rounded border-slate-300"
                      />
                      <span className="text-sm text-slate-700">Sipariş numarası göster</span>
                    </label>
                    <input
                      type="text"
                      value={settings.printStyle.kitchenFooterExtra}
                      onChange={(e) => patchPrintStyle({ kitchenFooterExtra: e.target.value })}
                      placeholder="Mutfak ek alt satır"
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
                    />
                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-1">Varsayılan mutfak yazıcısı</label>
                      <select
                        value={settings.defaultKitchenPrinter}
                        onChange={(e) => setSettings((p) => ({ ...p, defaultKitchenPrinter: e.target.value }))}
                        className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm"
                      >
                        <option value="">Seçilmedi</option>
                        {availablePrinters.map((p) => (
                          <option key={`k2-${p.name}`} value={p.name}>{p.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-center justify-between bg-slate-50 rounded-xl p-3 border border-slate-100">
                      <div>
                        <p className="font-semibold text-slate-800 text-sm">Otomatik mutfak fişi</p>
                        <p className="text-xs text-slate-500">Sipariş gönderilince</p>
                      </div>
                      <button type="button" onClick={() => setSettings((p) => ({ ...p, autoPrintKitchen: !p.autoPrintKitchen }))}>
                        {settings.autoPrintKitchen ? (
                          <ToggleRight className="w-10 h-10 text-orange-500" />
                        ) : (
                          <ToggleLeft className="w-10 h-10 text-slate-300" />
                        )}
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => setView('kategori')}
                      className="text-sm font-semibold text-orange-700 hover:underline w-full text-left"
                    >
                      Kategori → yazıcı eşlemesi →
                    </button>
                  </>
                )}

                {view === 'adisyon' && (
                  <>
                    <input
                      type="text"
                      value={settings.printStyle.receiptFooterExtra}
                      onChange={(e) => patchPrintStyle({ receiptFooterExtra: e.target.value })}
                      placeholder="Teşekkür üstü ek satır"
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
                    />
                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-1">Adisyon yazıcısı</label>
                      <select
                        value={settings.defaultReceiptPrinter}
                        onChange={(e) => setSettings((p) => ({ ...p, defaultReceiptPrinter: e.target.value }))}
                        className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm"
                      >
                        <option value="">Seçilmedi</option>
                        {availablePrinters.map((p) => (
                          <option key={`r2-${p.name}`} value={p.name}>{p.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-center justify-between bg-slate-50 rounded-xl p-3 border border-slate-100">
                      <div>
                        <p className="font-semibold text-slate-800 text-sm">Otomatik müşteri fişi</p>
                        <p className="text-xs text-slate-500">Ödeme alınınca</p>
                      </div>
                      <button type="button" onClick={() => setSettings((p) => ({ ...p, autoPrintReceipt: !p.autoPrintReceipt }))}>
                        {settings.autoPrintReceipt ? (
                          <ToggleRight className="w-10 h-10 text-orange-500" />
                        ) : (
                          <ToggleLeft className="w-10 h-10 text-slate-300" />
                        )}
                      </button>
                    </div>
                    <div className="flex items-center justify-between bg-amber-50 rounded-xl p-3 border border-amber-200">
                      <div className="pr-2">
                        <p className="font-semibold text-amber-900 text-sm">Ödemede adisyon açık</p>
                        <p className="text-xs text-amber-800/80">Varsayılan toggle</p>
                      </div>
                      <button type="button" onClick={() => setSettings((p) => ({ ...p, receiptPrintDefaultOn: !p.receiptPrintDefaultOn }))}>
                        {settings.receiptPrintDefaultOn ? (
                          <ToggleRight className="w-10 h-10 text-amber-500" />
                        ) : (
                          <ToggleLeft className="w-10 h-10 text-slate-300" />
                        )}
                      </button>
                    </div>
                  </>
                )}

                {view === 'paket' && (
                  <>
                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-1">Paket / kurye yazıcısı</label>
                      <select
                        value={settings.defaultTakeawayPrinter || ''}
                        onChange={(e) => setSettings((p) => ({ ...p, defaultTakeawayPrinter: e.target.value }))}
                        className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm"
                      >
                        <option value="">Önce Paket tipi, sonra adisyon</option>
                        {availablePrinters.map((p) => (
                          <option key={`t2-${p.name}`} value={p.name}>{p.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-center justify-between bg-slate-50 rounded-xl p-3 border border-slate-100">
                      <div>
                        <p className="font-semibold text-slate-800 text-sm">Otomatik paket fişi</p>
                        <p className="text-xs text-slate-500">Paket siparişinde</p>
                      </div>
                      <button type="button" onClick={() => setSettings((p) => ({ ...p, autoPrintTakeaway: !p.autoPrintTakeaway }))}>
                        {settings.autoPrintTakeaway !== false ? (
                          <ToggleRight className="w-10 h-10 text-orange-500" />
                        ) : (
                          <ToggleLeft className="w-10 h-10 text-slate-300" />
                        )}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {view === 'genel' && (
      <div className="bg-white rounded-xl border border-slate-200 p-4 md:p-6 space-y-4">
        <h4 className="font-bold text-slate-800 text-base border-b border-slate-100 pb-3 flex items-center gap-2">
          <Settings2 className="w-4 h-4 text-orange-500" /> Restoran bilgileri (tüm fişler)
        </h4>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">Restoran Adı (Fiş Başlığı)</label>
            <input
              type="text"
              value={settings.restaurantName}
              onChange={e => setSettings(p => ({ ...p, restaurantName: e.target.value }))}
              className="w-full px-3 py-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-orange-400 focus:border-transparent outline-none text-sm"
              placeholder="Restoran adı"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">Telefon</label>
            <input
              type="text"
              value={settings.restaurantPhone}
              onChange={e => setSettings(p => ({ ...p, restaurantPhone: e.target.value }))}
              className="w-full px-3 py-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-orange-400 focus:border-transparent outline-none text-sm"
              placeholder="0212 xxx xx xx"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">Adres</label>
          <input
            type="text"
            value={settings.restaurantAddress ?? ''}
            onChange={e => setSettings(p => ({ ...p, restaurantAddress: e.target.value }))}
            className="w-full px-3 py-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-orange-400 focus:border-transparent outline-none text-sm"
            placeholder="Restoran adresi (fişte görünür)"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">Fiş Alt Yazısı</label>
          <input
            type="text"
            value={settings.receiptFooter}
            onChange={e => setSettings(p => ({ ...p, receiptFooter: e.target.value }))}
            className="w-full px-3 py-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-orange-400 focus:border-transparent outline-none text-sm"
            placeholder="Teşekkür ederiz, iyi günler!"
          />
        </div>
      </div>
      )}

      {view === 'online' && (
      <div className="bg-white rounded-xl border border-slate-200 p-4 md:p-6 space-y-4">
        <h4 className="font-bold text-slate-800 text-base border-b border-slate-100 pb-3 flex items-center gap-2">
          <Globe className="w-4 h-4 text-orange-500" /> Online platform fişi
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl border-2 border-orange-200 bg-orange-50/40 p-4 space-y-3 md:col-span-2">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1 uppercase tracking-wide">
                Online sipariş fişi (Getir / Yemeksepeti / Trendyol)
              </label>
              <p className="text-[11px] text-slate-600">
                Tüm online sipariş onay fişleri bu yazıcıdan çıkar. Boş bırakırsanız varsayılan mutfak yazıcısı kullanılır.
              </p>
            </div>
            <label className="flex items-center gap-2 mb-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={settings.autoApproveOnlineOrders === true}
                onChange={(e) =>
                  setSettings((p) => ({ ...p, autoApproveOnlineOrders: e.target.checked }))
                }
                className="w-4 h-4 rounded border-orange-300 text-orange-600 focus:ring-orange-400"
              />
              <span className="text-sm font-semibold text-slate-700">
                Otomatik onay + fiş (sipariş gelince kasada onayla ve yazdır)
              </span>
            </label>
            <select
              value={settings.defaultOnlinePlatformPrinter || ''}
              onChange={(e) => setSettings((p) => ({ ...p, defaultOnlinePlatformPrinter: e.target.value }))}
              className="w-full px-3 py-2.5 rounded-lg border border-orange-200 bg-orange-50/50 focus:ring-2 focus:ring-orange-400 focus:border-transparent outline-none text-sm"
            >
              <option value="">Varsayılan mutfak yazıcısını kullan</option>
              {availablePrinters.map((p) => (
                <option key={`on2-${p.name}`} value={p.name}>
                  {p.name}
                  {p.isDefault ? ' (Windows varsayılan)' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
      )}

      {view === 'kategori' && categories.length > 0 && (settings.printers.some((p) => p.enabled && (p.type === 'kitchen' || p.type === 'bar' || p.type === 'custom')) || settings.defaultKitchenPrinter) && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 md:p-6 space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <h4 className="font-bold text-slate-800 text-base flex items-center gap-2">
              <Settings2 className="w-4 h-4 text-emerald-500" /> Kategori → Yazıcı Eşleme
            </h4>
            <p className="text-xs text-slate-500 mt-1">
              Her ürün grubu için tek tıkla yazıcı seçin. Seçim <strong>otomatik kaydedilir</strong> ve bir sonraki sipariş gönderiminden itibaren geçerli olur. <strong>Ürün kartında özel yazıcı yazılıysa</strong> o öncelikli; eşleme yoksa <strong>varsayılan mutfak yazıcısı</strong> devreye girer. Bir kategori aynı anda yalnızca bir mutfak yazıcısına gider (deterministik).
            </p>
          </div>

          <label className="flex items-start gap-3 px-3 py-2.5 rounded-xl border border-slate-200 bg-amber-50/40 cursor-pointer hover:bg-amber-50">
            <input
              type="checkbox"
              checked={settings.strictCategoryPrinterRouting}
              onChange={(e) =>
                setSettings((p) => ({ ...p, strictCategoryPrinterRouting: e.target.checked }))
              }
              className="mt-0.5 w-4 h-4 accent-orange-500"
            />
            <div className="flex-1">
              <div className="text-sm font-semibold text-slate-800">
                Sadece eşlenmiş kategoriler basılsın (Sıkı mod)
              </div>
              <p className="text-[11px] text-slate-500 leading-snug mt-0.5">
                Açıkken: yalnızca aşağıda bir yazıcıya eşlenen kategorilerin ürünleri mutfak fişine düşer.
                Eşlenmemiş kategorilerin ürünleri <strong>hiçbir yazıcıya gönderilmez</strong> (catch-all ve
                varsayılan mutfak yazıcısı devre dışıdır).
              </p>
            </div>
          </label>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {categories.map((cat) => {
              const matchedIdx = settings.printers.findIndex(
                (p) =>
                  p.enabled &&
                  (p.type === 'kitchen' || p.type === 'bar' || p.type === 'custom') &&
                  p.categoryIds.includes(cat.id)
              );
              const effective = resolveCategoryPrinter(settings, cat.id);
              const sourceLabel =
                effective?.source === 'category'
                  ? 'Eşlendi'
                  : effective?.source === 'catch-all'
                    ? 'Catch-all'
                    : effective?.source === 'default'
                      ? 'Varsayılan'
                      : 'YOK';
              const sourceColor =
                effective?.source === 'category'
                  ? 'bg-emerald-100 text-emerald-700'
                  : effective
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-red-100 text-red-700';
              return (
                <div
                  key={cat.id}
                  className="flex flex-col gap-1.5 px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-800 text-sm truncate">{cat.name}</span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${sourceColor}`}
                    >
                      {sourceLabel}
                    </span>
                  </div>
                  <select
                    value={matchedIdx === -1 ? '' : String(matchedIdx)}
                    onChange={(e) => {
                      const target = e.target.value === '' ? -1 : Number(e.target.value);
                      setSettings((s) => assignCategoryToKitchenPrinter(s, cat.id, target));
                    }}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-orange-400 focus:border-transparent outline-none text-sm bg-white"
                  >
                    <option value="">— Otomatik (catch-all / varsayılan) —</option>
                    {settings.printers.map((p, idx) => {
                      if (!p.enabled) return null;
                      const isKitchen =
                        p.type === 'kitchen' || p.type === 'bar' || p.type === 'custom';
                      if (!isKitchen) return null;
                      return (
                        <option key={idx} value={idx}>
                          {p.label || p.printerName} ({typeInfo(p.type).label})
                        </option>
                      );
                    })}
                  </select>
                  <p className="text-[11px] text-slate-500 truncate">
                    {effective
                      ? `→ ${effective.printerName}`
                      : '⚠ Atanmadı — yukarıdan varsayılan mutfak yazıcısı seçin.'}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {view === 'kategori' && categories.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 md:p-6 space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <h4 className="font-bold text-slate-800 text-base flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-500" /> Kategori Yazdirma Kontrolu
            </h4>
            <p className="text-xs text-slate-500 mt-1">Kapali kategorilerin urunleri icin mutfak/bar ficsi cikmaz. Kasa ficsi etkilenmez.</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {categories.map(cat => {
              const isDisabled = (settings.disabledCategoryIds || []).includes(cat.id);
              return (
                <button
                  key={cat.id}
                  onClick={() => {
                    const current = settings.disabledCategoryIds || [];
                    const updated = isDisabled ? current.filter(id => id !== cat.id) : [...current, cat.id];
                    setSettings(p => ({ ...p, disabledCategoryIds: updated }));
                  }}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                    isDisabled
                      ? 'bg-red-50 border-red-200 text-red-700'
                      : 'bg-green-50 border-green-200 text-green-700'
                  }`}
                >
                  <span className="truncate">{cat.name}</span>
                  {isDisabled
                    ? <XCircle className="w-4 h-4 flex-shrink-0 ml-2" />
                    : <CheckCircle className="w-4 h-4 flex-shrink-0 ml-2" />
                  }
                </button>
              );
            })}
          </div>
        </div>
      )}

      {view === 'yazicilar' && (
      <div className="bg-white rounded-xl border border-slate-200 p-4 md:p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h4 className="font-bold text-slate-800 text-base flex items-center gap-2">
            <Printer className="w-4 h-4 text-orange-500" /> Yazıcı Listesi
          </h4>
          <div className="flex gap-2">
            {(isElectron() || agentConnected) && (
              <button
                onClick={fetchPrinters}
                disabled={loadingPrinters}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600 text-xs font-semibold transition"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingPrinters ? 'animate-spin' : ''}`} />
                Yenile
              </button>
            )}
            <button
              onClick={() => setShowAddPrinter(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-xs font-semibold transition"
            >
              <Plus className="w-3.5 h-3.5" /> Yazıcı Ekle
            </button>
          </div>
        </div>

        <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-3 leading-relaxed">
          <span className="font-bold text-slate-800">Yönlendirme sırası: </span>
          1) Ürün kartındaki yazıcı adı &nbsp;→&nbsp; 2) Yukarıdaki <strong>“Kategori → Yazıcı Eşleme”</strong> seçimi &nbsp;→&nbsp; 3) Kategori listesi boş bırakılan &quot;catch-all&quot; mutfak satırı &nbsp;→&nbsp; 4) <strong>Varsayılan mutfak yazıcısı</strong>.
          <br />
          <strong>Fiş/Kasa</strong> ve <strong>Paket/Kurye</strong> tipleri mutfak fişine karışmaz — adisyon için üstteki &quot;Adisyon yazıcısı&quot;nı, paket için &quot;Paket/Kurye&quot; yazıcısını kullanın. Aşağıdaki liste yazıcıların kendisini yönetir; günlük kategori atamasını üstteki panelden yapın.
        </p>

        {availablePrinters.length > 0 && (
          <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Sisteme Kayıtlı Yazıcılar</p>
            <div className="flex flex-wrap gap-2">
              {availablePrinters.map(p => (
                <span key={p.name} className={`px-2 py-1 rounded-lg text-xs font-medium border ${p.isDefault ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-slate-200 text-slate-600'}`}>
                  {p.name}{p.isDefault ? ' ★' : ''}
                </span>
              ))}
            </div>
          </div>
        )}

        {showAddPrinter && (
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <h5 className="font-bold text-slate-700 text-sm">Yeni Yazıcı Ekle</h5>
              <button onClick={() => setShowAddPrinter(false)} className="p-1 hover:bg-slate-200 rounded-lg transition">
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1 uppercase tracking-wide">Yazıcı</label>
                {availablePrinters.length > 0 ? (
                  <select
                    value={newPrinter.printerName}
                    onChange={e => setNewPrinter(p => ({ ...p, printerName: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-orange-400 focus:border-transparent outline-none text-sm"
                  >
                    <option value="">Yazıcı seçin</option>
                    {availablePrinters.map(p => (
                      <option key={p.name} value={p.name}>{p.name}{p.isDefault ? ' (Varsayılan)' : ''}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={newPrinter.printerName}
                    onChange={e => setNewPrinter(p => ({ ...p, printerName: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-orange-400 focus:border-transparent outline-none text-sm"
                    placeholder="Yazıcı adını manuel girin"
                  />
                )}
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1 uppercase tracking-wide">Etiket</label>
                <input
                  type="text"
                  value={newPrinter.label}
                  onChange={e => setNewPrinter(p => ({ ...p, label: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-orange-400 focus:border-transparent outline-none text-sm"
                  placeholder="Örn: Mutfak Yazıcısı"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1 uppercase tracking-wide">Tür</label>
                <select
                  value={newPrinter.type}
                  onChange={e => setNewPrinter(p => ({ ...p, type: e.target.value as any }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-orange-400 focus:border-transparent outline-none text-sm"
                >
                  {PRINTER_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowAddPrinter(false)} className="px-4 py-2 border border-slate-200 rounded-lg text-slate-600 text-sm hover:bg-slate-50 transition font-semibold">
                İptal
              </button>
              <button onClick={addPrinter} disabled={!newPrinter.printerName} className="px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition flex items-center gap-1.5">
                <Plus className="w-3.5 h-3.5" /> Ekle
              </button>
            </div>
          </div>
        )}

        {settings.printers.length === 0 ? (
          <div className="text-center py-8 text-slate-400">
            <Printer className="w-10 h-10 mx-auto mb-2 text-slate-200" />
            <p className="text-sm font-medium">Henüz yazıcı eklenmedi</p>
            <p className="text-xs mt-1">Sisteme bağlı yazıcıları yukarıdan ekleyin</p>
          </div>
        ) : (
          <div className="space-y-3">
            {settings.printers.map((printer, index) => {
              const tInfo = typeInfo(printer.type);
              const isExpanded = expandedPrinter === index;
              return (
                <div key={index} className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="flex items-center gap-3 px-4 py-3 bg-slate-50">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-slate-800 text-sm">{printer.label || printer.printerName}</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${tInfo.color}`}>{tInfo.label}</span>
                        {!printer.enabled && <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-600">Kapalı</span>}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">{printer.printerName}</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {printer.categoryIds.length === 0
                          ? 'Tüm kategoriler'
                          : printer.categoryIds.map(cid => categories.find(c => c.id === cid)?.name || cid).join(', ')
                        }
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleTestPrint(printer.printerName, printer.type)}
                        className="px-2 py-1.5 text-xs bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg transition font-semibold"
                      >
                        Test
                      </button>
                      <button
                        onClick={() => setExpandedPrinter(isExpanded ? null : index)}
                        className="p-1.5 hover:bg-slate-200 rounded-lg transition"
                      >
                        <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                      </button>
                      <button
                        onClick={() => removePrinter(index)}
                        className="p-1.5 hover:bg-red-50 text-red-400 hover:text-red-600 rounded-lg transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="px-4 pb-4 pt-3 space-y-4 border-t border-slate-100 bg-white">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-bold text-slate-600 mb-1 uppercase tracking-wide">Etiket</label>
                          <input
                            type="text"
                            value={printer.label}
                            onChange={e => updatePrinter(index, { label: e.target.value })}
                            className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-orange-400 focus:border-transparent outline-none text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-600 mb-1 uppercase tracking-wide">Tür</label>
                          <select
                            value={printer.type}
                            onChange={e => updatePrinter(index, { type: e.target.value as any })}
                            className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-orange-400 focus:border-transparent outline-none text-sm"
                          >
                            {PRINTER_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                          </select>
                        </div>
                      </div>

                      <div className="flex items-center justify-between bg-slate-50 rounded-lg p-3">
                        <p className="text-sm font-semibold text-slate-700">Yazıcı Aktif</p>
                        <button onClick={() => updatePrinter(index, { enabled: !printer.enabled })}>
                          {printer.enabled
                            ? <ToggleRight className="w-9 h-9 text-orange-500" />
                            : <ToggleLeft className="w-9 h-9 text-slate-300" />
                          }
                        </button>
                      </div>

                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <p className="text-xs font-bold text-slate-600 uppercase tracking-wide">Kategoriler</p>
                          <span className="text-xs text-slate-400">(boş = tüm kategoriler)</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {categories.map(cat => {
                            const selected = printer.categoryIds.includes(cat.id);
                            return (
                              <button
                                key={cat.id}
                                onClick={() => toggleCategory(index, cat.id)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                                  selected
                                    ? 'bg-orange-500 border-orange-500 text-white'
                                    : 'bg-white border-slate-200 text-slate-600 hover:border-orange-300'
                                }`}
                              >
                                {selected && <CheckCircle className="w-3 h-3 inline-block mr-1" />}
                                {cat.name}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      )}

      {testResult && (
        <div className={`rounded-xl px-4 py-3 text-sm font-medium flex items-center gap-2 ${testResult.includes('Hata') ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-green-50 border border-green-200 text-green-700'}`}>
          {testResult.includes('Hata') ? <XCircle className="w-4 h-4 flex-shrink-0" /> : <CheckCircle className="w-4 h-4 flex-shrink-0" />}
          {testResult}
        </div>
      )}

      {view !== 'hub' && (
        <button
          type="button"
          onClick={handleSave}
          className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-6 py-2.5 rounded-xl font-semibold transition-all active:scale-95 shadow-md"
        >
          {saved ? <CheckCircle className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          {saved ? 'Kaydedildi!' : 'Ayarları Kaydet'}
        </button>
      )}
      {view === 'hub' && (
        <p className="text-xs text-slate-500 text-center">
          Değişiklikler fiş kartlarında otomatik kaydedilir. Buluta senkron için bir fiş ekranından «Kaydet» kullanabilirsiniz.
        </p>
      )}
    </div>
  );
}
