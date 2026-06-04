import { posDebugLog } from './posDebugLog';

export interface PrinterDevice {
  name: string;
  description: string;
  status: number;
  isDefault: boolean;
}

export interface PrinterConfig {
  printerName: string;
  categoryIds: string[];
  label: string;
  type: 'kitchen' | 'bar' | 'receipt' | 'takeaway' | 'custom';
  enabled: boolean;
}

/** Termal fiş görünümü (mutfak / adisyon / paket şablonları) */
export interface PrintStyleSettings {
  kitchenTitlePx: number;
  kitchenBodyPx: number;
  kitchenItemPx: number;
  receiptTitlePx: number;
  receiptBodyPx: number;
  kitchenSubtitle: string;
  receiptSubtitle: string;
  kitchenFooterExtra: string;
  receiptFooterExtra: string;
  showKitchenOrderNumber: boolean;
  /** Mutfak: restoran adı ve masa başlığı kalın */
  kitchenTitleBold: boolean;
  /** Mutfak: ürün satırı kalın */
  kitchenProductBold: boolean;
  /** Adisyon / paket: üst başlık kalın */
  receiptTitleBold: boolean;
  /** Adisyon / paket: ürün adı ve tutar kolonu kalın */
  receiptProductBold: boolean;
  /** Adisyon / paket: TOPLAM satırı kalın */
  receiptTotalBold: boolean;
  /**
   * 80 mm termal kağıtta yatay yazı kayması (mm).
   *
   * - Pozitif değer: içerik sağa kayar (sol kenara daha çok boşluk).
   * - Negatif değer: içerik sola kayar (kağıdın sağındaki boş alanı azaltır,
   *   sola taşma riski vardır).
   *
   * Yazıcı modeline göre fiş tam ortalanmıyorsa Ayarlar → Yazıcılar → Fiş
   * görünümü altından ayarlanabilir.
   */
  paperOffsetMm: number;
}

export interface PrintSettings {
  printers: PrinterConfig[];
  /** Müşteri adisyonu / ödeme fişi — yalnızca bu yazıcıdan çıkar */
  defaultReceiptPrinter: string;
  /** Mutfak/bar: kategori veya ürün eşlemesi yoksa son çare (kasa fişine düşmez) */
  defaultKitchenPrinter: string;
  /**
   * Getir / Yemeksepeti / Trendyol onay fişi — «Onayla» sonrası doğrudan bu yazıcıdan basılır.
   * Boşsa `defaultKitchenPrinter` kullanılır.
   */
  defaultOnlinePlatformPrinter: string;
  /**
   * Online sipariş geldiğinde kasada otomatik onay + mutfak fişi (alarm yine çalar).
   * Varsayılan kapalı — restoran açıkça açar.
   */
  autoApproveOnlineOrders: boolean;
  defaultTakeawayPrinter: string;
  autoPrintKitchen: boolean;
  autoPrintReceipt: boolean;
  autoPrintTakeaway: boolean;
  /**
   * Ödeme alma ekranında "Adisyon Yazdır" toggle'ının varsayılan değeri.
   * - false (varsayılan): kullanıcı isterse açar; hiçbir restoranı zorlamayız
   *   ve yanlışlıkla her ödemede gereksiz fiş basılmasını önler.
   * - true: restoran her ödemede otomatik adisyon basmak istediğini belirtti;
   *   ödeme modal'ı açıldığında toggle açık gelir.
   */
  receiptPrintDefaultOn: boolean;
  /**
   * Sıkı kategori yönlendirmesi.
   * - false (varsayılan): kategori için yazıcı seçilmediyse catch-all veya
   *   `defaultKitchenPrinter` devreye girer; kategori atanmamış ürünler de
   *   bir yerde basılır.
   * - true: yalnızca **kategori → yazıcı eşlemesi açıkça yapılmış** ürünler
   *   mutfağa gönderilir. Eşlemesi olmayan ürünler hiçbir yazıcıya
   *   düşmez (mutfak fişine eklenmez).
   */
  strictCategoryPrinterRouting: boolean;
  restaurantName: string;
  restaurantPhone: string;
  restaurantAddress: string;
  receiptFooter: string;
  disabledCategoryIds: string[];
  printStyle: PrintStyleSettings;
}

import { supabase } from './supabase';
import { dispatchPrintToast } from './printToasts';
import { formatMoneyReceipt, getActiveCurrencyCode } from './currency';

/**
 * Yazıcı ayarları artık tenant + branch başına ayrı tutulur. Aynı tarayıcı
 * üzerinden birden fazla tenant/şube ile çalışan kullanıcıların ayarları
 * birbirine karışmasın diye localStorage anahtarı dinamik üretilir.
 *
 *   - Eski (legacy) anahtar: `shefpos_print_settings`
 *   - Yeni anahtar:           `shefpos_print_settings:<tenantId>[:<branchId>]`
 *
 * Tenant veya branch henüz set edilmediyse legacy anahtar kullanılır
 * (preauth durumlar). Login sonrası AuthContext `setPrintAgentTenantId` ve
 * `setPrintAgentBranchId` çağırarak bağlamı verir; sonraki tüm
 * `loadPrintSettings/savePrintSettings` çağrıları otomatik olarak
 * tenant'a özel anahtara döner.
 */
const PRINT_SETTINGS_LEGACY_KEY = 'shefpos_print_settings';
const PRINT_SETTINGS_PREFIX = 'shefpos_print_settings';
/** Yerel düzenleme zamanı (ms); bulut `updated_at` ile karşılaştırılır — gecikmiş fetch yereli silmesin. */
const PRINT_SETTINGS_LASTMOD_PREFIX = 'shefpos_print_settings_lastmod';
/** Buluta yazılamadıysa JSON; çevrimiçi olunca veya sonraki fetch’te tekrar deneriz. */
const PRINT_SETTINGS_PENDING_PUSH_KEY = 'shefpos_print_settings_pending_push';
const PRINT_AGENT_URL = 'http://127.0.0.1:7878';
/** Web dev: 7878 yok → konsolda ERR_CONNECTION_REFUSED spam olmasın */
let printAgentBackoffUntil = 0;
const PRINT_AGENT_BACKOFF_MS = 120_000;

function shouldTryExternalPrintAgent(): boolean {
  if (isElectron()) return Date.now() >= printAgentBackoffUntil;
  try {
    return localStorage.getItem('shefpos_use_external_print_agent') === '1';
  } catch {
    return false;
  }
}

/** `savePrintSettings` her çağrıda artar; uçuşta kalan eski `fetch` sonucu yoksayılır. */
let __printSettingsSaveGen = 0;

/** Tenant / branch değiştiğinde dinleyenlerin kendi state'ini tazelemesi için emit edilir. */
export const PRINT_SETTINGS_CONTEXT_EVENT = 'sefpos:print-settings-context';

/**
 * Cloud (`public.print_settings`) tarafından yeni ayarlar lokal cache'e
 * indirildiğinde yayınlanır. UI bunu dinleyerek `loadPrintSettings()`'i
 * tekrar okur ve formu tazeler. Böylece Electron kasada yapılan kategori
 * eşlemesi web ve mobil tarafında otomatik görünür.
 */
export const PRINT_SETTINGS_REMOTE_UPDATED_EVENT = 'sefpos:print-settings-remote-updated';

/** Mutfak yönlendirmesine dahil tipler (paket/kasa tipi burada kullanılmaz) */
const KITCHEN_ROUTE_TYPES = new Set<PrinterConfig['type']>(['kitchen', 'bar', 'custom']);

let _currentBranchId: string | null = null;
let _currentTenantId: string | null = null;

function emitContextChange() {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(
      new CustomEvent(PRINT_SETTINGS_CONTEXT_EVENT, {
        detail: { tenantId: _currentTenantId, branchId: _currentBranchId },
      }),
    );
  } catch (_) { /* yoksay */ }
}

export function setPrintAgentBranchId(branchId: string | null) {
  if (_currentBranchId === branchId) return;
  _currentBranchId = branchId;
  // Tenant + branch artık bilindiği için eski tek-kullanıcılık legacy anahtarı
  // kalmasın → başka bir tenant login olduğunda yanlışlıkla ona kopyalanmasın.
  try { localStorage.removeItem(PRINT_SETTINGS_LEGACY_KEY); } catch {}
  emitContextChange();
}

export function setPrintAgentTenantId(tenantId: string | null) {
  if (_currentTenantId === tenantId) return;
  _currentTenantId = tenantId;
  try { localStorage.removeItem(PRINT_SETTINGS_LEGACY_KEY); } catch {}
  emitContextChange();
}

export function getPrintSettingsContext(): { tenantId: string | null; branchId: string | null } {
  return { tenantId: _currentTenantId, branchId: _currentBranchId };
}

/**
 * Bu tenant + (varsa) branch için kullanılacak localStorage anahtarını üretir.
 * Tenant ID henüz bilinmiyorsa legacy anahtara döner (login öncesi).
 */
function getPrintSettingsKey(): string {
  if (!_currentTenantId) return PRINT_SETTINGS_LEGACY_KEY;
  return _currentBranchId
    ? `${PRINT_SETTINGS_PREFIX}:${_currentTenantId}:${_currentBranchId}`
    : `${PRINT_SETTINGS_PREFIX}:${_currentTenantId}`;
}

export const DEFAULT_PRINT_STYLE: PrintStyleSettings = {
  kitchenTitlePx: 16,
  kitchenBodyPx: 12,
  kitchenItemPx: 15,
  receiptTitlePx: 16,
  receiptBodyPx: 12,
  kitchenSubtitle: '',
  receiptSubtitle: '',
  kitchenFooterExtra: '',
  receiptFooterExtra: '',
  showKitchenOrderNumber: true,
  kitchenTitleBold: true,
  kitchenProductBold: true,
  receiptTitleBold: true,
  receiptProductBold: true,
  receiptTotalBold: true,
  paperOffsetMm: 0,
};

function printWeight(bold: boolean, extra = false): number {
  if (!bold) return 500;
  return extra ? 900 : 800;
}

/**
 * `paperOffsetMm` değerini güvenli aralıkta tutar (-15 mm … +15 mm).
 * Bu sınırlar kağıdın 72 mm'lik içerik alanı düşünüldüğünde fiziksel olarak
 * mantıklı; daha fazla kaydırma içeriği klipler.
 */
function clampOffsetMm(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(-15, Math.min(15, n));
}

function normalizePrintSettings(raw: Partial<PrintSettings> & Record<string, unknown>): PrintSettings {
  const ps = raw as PrintSettings;
  const validTypes: PrinterConfig['type'][] = ['kitchen', 'bar', 'receipt', 'takeaway', 'custom'];
  return {
    printers: Array.isArray(ps.printers)
      ? ps.printers.map((p: any): PrinterConfig => ({
          printerName: typeof p?.printerName === 'string' ? p.printerName : '',
          label: typeof p?.label === 'string' ? p.label : '',
          type: validTypes.includes(p?.type) ? p.type : 'kitchen',
          categoryIds: Array.isArray(p?.categoryIds)
            ? p.categoryIds.filter((c: any) => typeof c === 'string' && c.length > 0)
            : [],
          enabled: p?.enabled !== false,
        }))
      : [],
    defaultReceiptPrinter: typeof ps.defaultReceiptPrinter === 'string' ? ps.defaultReceiptPrinter : '',
    defaultKitchenPrinter: typeof ps.defaultKitchenPrinter === 'string' ? ps.defaultKitchenPrinter : '',
    defaultOnlinePlatformPrinter:
      typeof ps.defaultOnlinePlatformPrinter === 'string' ? ps.defaultOnlinePlatformPrinter : '',
    autoApproveOnlineOrders: ps.autoApproveOnlineOrders === true,
    defaultTakeawayPrinter: typeof ps.defaultTakeawayPrinter === 'string' ? ps.defaultTakeawayPrinter : '',
    autoPrintKitchen: ps.autoPrintKitchen !== false,
    autoPrintReceipt: !!ps.autoPrintReceipt,
    autoPrintTakeaway: ps.autoPrintTakeaway !== false,
    // Yeni alan: eski kayıtlarda yok → varsayılan kapalı (kullanıcı isterse açar).
    receiptPrintDefaultOn: ps.receiptPrintDefaultOn === true,
    // Varsayılan açık: yalnızca açıkça eşlenen kategoriler basılır.
    strictCategoryPrinterRouting: ps.strictCategoryPrinterRouting !== false,
    restaurantName: typeof ps.restaurantName === 'string' ? ps.restaurantName : '',
    restaurantPhone: typeof ps.restaurantPhone === 'string' ? ps.restaurantPhone : '',
    restaurantAddress: typeof ps.restaurantAddress === 'string' ? ps.restaurantAddress : '',
    receiptFooter: typeof ps.receiptFooter === 'string' ? ps.receiptFooter : 'Teşekkür ederiz, iyi günler!',
    disabledCategoryIds: Array.isArray(ps.disabledCategoryIds) ? ps.disabledCategoryIds : [],
    printStyle: (() => {
      const merged = { ...DEFAULT_PRINT_STYLE, ...(ps.printStyle && typeof ps.printStyle === 'object' ? ps.printStyle : {}) };
      merged.paperOffsetMm = clampOffsetMm(merged.paperOffsetMm);
      if (merged.kitchenTitleBold === undefined) merged.kitchenTitleBold = true;
      if (merged.kitchenProductBold === undefined) merged.kitchenProductBold = true;
      if (merged.receiptTitleBold === undefined) merged.receiptTitleBold = true;
      if (merged.receiptProductBold === undefined) merged.receiptProductBold = true;
      if (merged.receiptTotalBold === undefined) merged.receiptTotalBold = true;
      return merged;
    })(),
  };
}

function getPrintSettingsLastmodKey(tenantId: string, branchId: string | null): string {
  return `${PRINT_SETTINGS_LASTMOD_PREFIX}:${tenantId}:${branchId ?? 'null'}`;
}

function readPrintSettingsLastmodMs(tenantId: string, branchId: string | null): number {
  try {
    const v = localStorage.getItem(getPrintSettingsLastmodKey(tenantId, branchId));
    if (!v) return 0;
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

function writePrintSettingsLastmodMs(tenantId: string, branchId: string | null, ms: number) {
  try {
    localStorage.setItem(getPrintSettingsLastmodKey(tenantId, branchId), String(ms));
  } catch {
    /* quota */
  }
}

/**
 * Buluttan gelen satır "boş şablon" mu — yerel makinedeki dolu yazıcı listesinin
 * üzerine yazılıp silinmesin diye kullanılır.
 */
function isPrintSettingsEffectivelyWithoutPrinters(s: PrintSettings): boolean {
  const c = normalizePrintSettings(s);
  return (
    c.printers.length === 0 &&
    !String(c.defaultReceiptPrinter || '').trim() &&
    !String(c.defaultKitchenPrinter || '').trim() &&
    !String(c.defaultOnlinePlatformPrinter || '').trim() &&
    !String(c.defaultTakeawayPrinter || '').trim()
  );
}

/**
 * İnternet geldikten veya oturum açıldıktan sonra bekleyen bulut yazımını dener.
 */
export async function flushPendingPrintSettingsToCloud(): Promise<void> {
  if (!_currentTenantId) return;
  try {
    const raw = localStorage.getItem(PRINT_SETTINGS_PENDING_PUSH_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as {
      tenantId?: string;
      branchId?: string | null;
      settings?: unknown;
    };
    if (parsed.tenantId !== _currentTenantId) return;
    const wantBranch = _currentBranchId ?? null;
    if ((parsed.branchId ?? null) !== wantBranch) return;
    const settings = normalizePrintSettings((parsed.settings || {}) as any);
    await pushPrintSettingsToCloud(settings);
    try {
      localStorage.removeItem(PRINT_SETTINGS_PENDING_PUSH_KEY);
    } catch {
      /* */
    }
    writePrintSettingsLastmodMs(_currentTenantId, _currentBranchId, Date.now());
  } catch (err: any) {
    console.warn('[ŞefPOS] print_settings bekleyen bulut senkronu başarısız:', err?.message || err);
  }
}

/**
 * Tenant + branch'a özel ayarları okur. Eski global anahtar (`shefpos_print_settings`)
 * varsa, **yalnızca aynı bilgisayarın geçmiş kullanıcısı bu tenant'a aitse**
 * okumak gerekir; aksi halde başka tenant'ın ayarlarını yanlışlıkla yapıştırırız.
 * Bu yüzden legacy migration kaldırıldı (cloud sync zaten devreye giriyor).
 * Eski kayıt yalnızca tenant context HENÜZ set edilmemişken (preauth) okunur.
 */
export function loadPrintSettings(): PrintSettings {
  try {
    const key = getPrintSettingsKey();
    const raw = localStorage.getItem(key);
    if (raw) return normalizePrintSettings(JSON.parse(raw));
  } catch {}
  return normalizePrintSettings({});
}

export function savePrintSettings(settings: PrintSettings) {
  const normalized = normalizePrintSettings(settings);
  const key = getPrintSettingsKey();
  __printSettingsSaveGen++;
  try {
    localStorage.setItem(key, JSON.stringify(normalized));
  } catch {}
  if (_currentTenantId) {
    try {
      writePrintSettingsLastmodMs(_currentTenantId, _currentBranchId, Date.now());
    } catch {
      /* */
    }
    void pushPrintSettingsToCloud(normalized)
      .then(() => {
        try {
          localStorage.removeItem(PRINT_SETTINGS_PENDING_PUSH_KEY);
        } catch {
          /* */
        }
      })
      .catch((err) => {
        console.warn('[ŞefPOS] print_settings cloud upsert başarısız:', err?.message || err);
        try {
          localStorage.setItem(
            PRINT_SETTINGS_PENDING_PUSH_KEY,
            JSON.stringify({
              tenantId: _currentTenantId,
              branchId: _currentBranchId,
              settings: normalized,
              savedAt: Date.now(),
            }),
          );
        } catch {
          /* */
        }
      });
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Cloud sync (public.print_settings)
//
// Tek kaynaklı doğru veri: Supabase. Lokal cache (localStorage) sadece UI
// bekleme süresini sıfırlamak için kullanılır. Login olduğunda AuthContext
// `fetchPrintSettingsFromCloud()` çağırır → cache güncellenir → UI tazelenir.
// `savePrintSettings()` her çağrıldığında bulut ile senkronize edilir.
// ─────────────────────────────────────────────────────────────────────────

/**
 * Cloud → cache senkronizasyonunda lokal değişikliklerin DB'ye geri
 * itilmesini engellemek için kısa bir koruma penceresi. Her cloud çekiminde
 * timestamp set edilir; bu pencere içinde gelen `savePrintSettings`
 * çağrısı yine cloud'a yazar (geri itme istenir; sadece doğrudan döngüyü
 * önlemek için değil, gerçek edit'leri kaybetmemek için).
 */
let _lastCloudPullAt: number = 0;

export async function fetchPrintSettingsFromCloud(): Promise<PrintSettings | null> {
  if (!_currentTenantId) return null;
  // Snapshot: ağ çağrısı sırasında kullanıcı tenant/branch değiştirebilir.
  // Aşağıda dönen yanıt yalnızca bu (tenant, branch) için cache'e yazılır;
  // değişmişse yanıtı kullanmadan döneriz — başka tenant'ın anahtarına
  // yanlışlıkla yazmayalım.
  const fetchedTenantId = _currentTenantId;
  const fetchedBranchId = _currentBranchId;
  const genAtStart = __printSettingsSaveGen;
  try {
    await flushPendingPrintSettingsToCloud();
    let query = (supabase.from('print_settings' as any) as any)
      .select('settings, updated_at')
      .eq('tenant_id', fetchedTenantId);
    query = fetchedBranchId
      ? query.eq('branch_id', fetchedBranchId)
      : query.is('branch_id', null);
    const { data, error } = await query.maybeSingle();
    if (genAtStart !== __printSettingsSaveGen) {
      return null;
    }
    if (error) {
      // Tablo henüz migrate edilmemiş veya PostgREST schema cache eski olabilir;
      // ilk login'de / migration sonrasında gürültü olmasın diye sessiz dön.
      const code = (error as any).code as string | undefined;
      const status = Number((error as any).status || (error as any).statusCode || 0);
      const msg = String(error.message || '').toLowerCase();
      const isMissingTable =
        status === 404 ||
        code === 'PGRST116' ||
        code === '42P01' ||
        code === 'PGRST205' ||
        msg.includes('schema cache') ||
        msg.includes('could not find the table') ||
        (msg.includes('relation') && msg.includes('print_settings'));
      if (!isMissingTable) {
        console.warn('[ŞefPOS] print_settings okuma hatası:', error.message);
      }
      return null;
    }
    if (!data || !data.settings) return null;
    // Context bu arada değiştiyse yanıtı uygulama — başka tenant'ın
    // cache'ini bu kayıtla kirletmemek için.
    if (fetchedTenantId !== _currentTenantId || fetchedBranchId !== _currentBranchId) {
      // Context değişti — bilgi amaçlı debug log (önceden warn idi, konsolu kirletiyordu)
      console.debug('[ŞefPOS] print_settings: tenant/branch fetch sırasında değişti, yanıt uygulanmadı.');
      return null;
    }
    if (genAtStart !== __printSettingsSaveGen) {
      return null;
    }

    const serverMs = new Date((data as any).updated_at || 0).getTime();
    const localLast = readPrintSettingsLastmodMs(fetchedTenantId, fetchedBranchId);
    if (localLast > serverMs + 2000) {
      console.info(
        '[ŞefPOS] print_settings: yerel yapılandırma buluttan daha yeni; gecikmiş yanıt uygulanmadı, yerel ayarlar sunucuya itiliyor.',
      );
      void pushPrintSettingsToCloud(loadPrintSettings()).catch(() => {});
      return null;
    }

    const key = getPrintSettingsKey();
    let localBefore: PrintSettings;
    try {
      const raw = localStorage.getItem(key);
      localBefore = raw ? normalizePrintSettings(JSON.parse(raw)) : normalizePrintSettings({});
    } catch {
      localBefore = normalizePrintSettings({});
    }

    let normalized = normalizePrintSettings(data.settings as any);
    let lastModToWrite = serverMs;
    if (isPrintSettingsEffectivelyWithoutPrinters(normalized) && !isPrintSettingsEffectivelyWithoutPrinters(localBefore)) {
      console.info(
        '[ŞefPOS] print_settings: sunucuda yazıcı eşlemesi yok; bu bilgisayardaki yerel ayarlar korunuyor ve tam yapılandırma sunucuya yazılıyor.',
      );
      normalized = localBefore;
      lastModToWrite = Date.now();
      void pushPrintSettingsToCloud(normalized).catch(() => {});
    }

    if (genAtStart !== __printSettingsSaveGen) {
      return null;
    }

    writePrintSettingsLastmodMs(fetchedTenantId, fetchedBranchId, lastModToWrite);
    try {
      localStorage.setItem(key, JSON.stringify(normalized));
    } catch (_) { /* quota vb. yoksay */ }
    _lastCloudPullAt = Date.now();
    if (typeof window !== 'undefined') {
      try {
        window.dispatchEvent(
          new CustomEvent(PRINT_SETTINGS_REMOTE_UPDATED_EVENT, {
            detail: { tenantId: fetchedTenantId, branchId: fetchedBranchId },
          }),
        );
      } catch (_) { /* yoksay */ }
    }
    return normalized;
  } catch (err: any) {
    console.warn('[ŞefPOS] print_settings cloud fetch exception:', err?.message || err);
    return null;
  }
}

async function pushPrintSettingsToCloud(settings: PrintSettings): Promise<void> {
  if (!_currentTenantId) return;
  // Context'i snapshot al; ağ çağrısı sırasında değişirse yanlış (tenant, branch)'a
  // yazmasın.
  const tenantIdSnap = _currentTenantId;
  const branchIdSnap = _currentBranchId;
  // upsert → aynı (tenant_id, branch_id) varsa update.
  const payload: any = {
    tenant_id: tenantIdSnap,
    branch_id: branchIdSnap,
    settings,
  };
  try {
    const { error } = await (supabase.from('print_settings' as any) as any).upsert(
      payload,
      { onConflict: 'tenant_id,branch_id' },
    );
    if (error) {
      const code = (error as any).code as string | undefined;
      const status = Number((error as any).status || (error as any).statusCode || 0);
      const msg = String((error as any).message || '').toLowerCase();
      // Tablo yok / schema cache eski → migration uygulanmamış veya PostgREST
      // henüz cache'i yenilememiş. Sessizce geç; lokal cache yeter.
      if (
        status === 404 ||
        code === '42P01' ||
        code === 'PGRST205' ||
        msg.includes('schema cache') ||
        msg.includes('could not find the table') ||
        (msg.includes('relation') && msg.includes('print_settings'))
      ) return;
      // Unique conflict NULL branch_id'de PostgREST upsert fail edebilir; bu
      // durumda manuel update + insert dener — snapshot kullan ki context
      // değişikliği başka tenant'ı etkilemesin.
      if (code === '23505' || code === '21000') {
        let q = (supabase.from('print_settings' as any) as any)
          .update({ settings })
          .eq('tenant_id', tenantIdSnap);
        q = branchIdSnap
          ? q.eq('branch_id', branchIdSnap)
          : q.is('branch_id', null);
        const { error: upErr, count } = await q.select('*', { count: 'exact', head: true });
        if (upErr) throw upErr;
        if (!count) {
          const { error: insErr } = await (supabase.from('print_settings' as any) as any).insert(payload);
          if (insErr) throw insErr;
        }
        return;
      }
      throw error;
    }
  } catch (err: any) {
    throw err;
  }
}

/** Diagnostik / log için. */
export function getLastPrintSettingsCloudPullAt(): number {
  return _lastCloudPullAt;
}

/** Adisyon / müşteri fişi yazıcı adı (trim) */
export function getAdisyonPrinterName(settings: PrintSettings): string {
  return (settings.defaultReceiptPrinter || '').trim();
}

export function getKitchenRoutePrinters(settings: PrintSettings): PrinterConfig[] {
  return settings.printers.filter((p) => p.enabled && KITCHEN_ROUTE_TYPES.has(p.type));
}

/**
 * UI ve runtime tarafından paylaşılan kategori → yazıcı çözümleyicisi.
 *
 * Öncelik:
 *   1. Aktif (kitchen/bar/custom) yazıcılardan kategoriyi listede tutan yazıcı.
 *   2. Kategorisi olmayan ürünler → `defaultKitchenPrinter` (varsa).
 *   3. `strictCategoryPrinterRouting === false` ise eski catch-all / varsayılan
 *      (geriye dönük); varsayılan modda yalnızca açık eşleme.
 *
 * Eşleme yoksa `null` → mutfak fişine eklenmez.
 */
export function resolveCategoryPrinter(
  settings: PrintSettings,
  categoryId: string | null | undefined
): { printerName: string; source: 'category' | 'catch-all' | 'default' } | null {
  const route = getKitchenRoutePrinters(settings);
  if (categoryId) {
    const matched = route.find((p) => p.categoryIds.length > 0 && p.categoryIds.includes(categoryId));
    if (matched) return { printerName: matched.printerName, source: 'category' };
    if (settings.strictCategoryPrinterRouting) return null;
    const catchAll = route.find((p) => p.categoryIds.length === 0);
    if (catchAll) return { printerName: catchAll.printerName, source: 'catch-all' };
    if (settings.defaultKitchenPrinter?.trim()) {
      return { printerName: settings.defaultKitchenPrinter.trim(), source: 'default' };
    }
    return null;
  }
  if (settings.defaultKitchenPrinter?.trim()) {
    return { printerName: settings.defaultKitchenPrinter.trim(), source: 'default' };
  }
  return null;
}

/**
 * Tek tıkla "şu kategoriyi şu yazıcıya bağla" mutasyonu.
 *
 * - `targetPrinterIndex === -1` → kategori tüm satırlardan çıkarılır
 *   (catch-all veya `defaultKitchenPrinter` devreye girer).
 * - Diğer tüm satırlardan kategori temizlenir, yalnızca seçilen yazıcıya
 *   eklenir → bir kategori asla iki yazıcıda eşleşmez (deterministik).
 */
export function assignCategoryToKitchenPrinter(
  settings: PrintSettings,
  categoryId: string,
  targetPrinterIndex: number
): PrintSettings {
  const printers = settings.printers.map((p, i) => {
    const cleaned = p.categoryIds.filter((c) => c !== categoryId);
    if (i === targetPrinterIndex && KITCHEN_ROUTE_TYPES.has(p.type) && p.enabled) {
      return { ...p, categoryIds: [...cleaned, categoryId] };
    }
    return { ...p, categoryIds: cleaned };
  });
  return { ...settings, printers };
}

/**
 * Ayarlardaki metin — ürün kartı > kategori eşlemesi > catch-all > varsayılan.
 * OS yazıcı adı çözümlemesi burada yapılmaz (web/mobil ile Electron aynı gruplama
 * mantığını paylaşsın diye).
 */
export function getLogicalKitchenPrinterName(settings: PrintSettings, item: KitchenPrintItem): string {
  if (item.productPrinterName?.trim()) return item.productPrinterName.trim();
  const r = resolveCategoryPrinter(settings, item.categoryId);
  return r?.printerName?.trim() ?? '';
}

function partitionKitchenItemsByLogicalPrinter(
  settings: PrintSettings,
  items: KitchenPrintItem[],
): { groups: Record<string, KitchenPrintItem[]>; unresolved: KitchenPrintItem[] } {
  const groups: Record<string, KitchenPrintItem[]> = {};
  const unresolved: KitchenPrintItem[] = [];
  for (const item of items) {
    const logical = getLogicalKitchenPrinterName(settings, item);
    if (!logical) {
      unresolved.push(item);
      continue;
    }
    (groups[logical] ||= []).push(item);
  }
  return { groups, unresolved };
}

/** Windows yazıcı listesi ile eşleştir (büyük/küçük harf, kısmi ad) */
export async function resolveThermalDeviceName(
  requested: string | null | undefined,
  devices: PrinterDevice[]
): Promise<string> {
  const t = (requested || '').trim();
  if (!t) return '';
  const names = devices.map((d) => d.name).filter(Boolean);
  if (names.includes(t)) return t;
  const tl = t.toLowerCase();
  const exactCi = names.find((n) => n.toLowerCase() === tl);
  if (exactCi) return exactCi;
  // Birden fazla kısmi eşleşme varsa en uzun cihaz adını seç (ör. "80mm"
  // hem "80mm Mutfak" hem "80mm Bar"a uymasın diye daha spesifik olan kazanır).
  const partialCandidates = names.filter(
    (n) => {
      const nl = n.toLowerCase();
      return nl.includes(tl) || tl.includes(nl);
    },
  );
  if (partialCandidates.length > 0) {
    partialCandidates.sort((a, b) => b.length - a.length);
    return partialCandidates[0];
  }
  return t;
}

export function isElectron(): boolean {
  return !!(window as any).electronAPI?.isElectron;
}

/**
 * Renderer-side fallback: hiç kategori eşlemesi yokken, bağlı yazıcı listesinden
 * isminde "mutfak/kitchen/bar/grill/thermal/fis" geçen ilkini seç. Bulunamazsa
 * listedeki ilk yazıcıyı verir; o da yoksa boş string. (Electron tarafında
 * `pickDefaultKitchenPrinter` ile aynı mantığa sahiptir; mobile/web isElectron
 * false olduğunda bu çağrılmaz.)
 */
/** Online platform onay fişi yazıcısı (Getir / YS / TY). */
export function getOnlinePlatformPrinterName(settings?: PrintSettings): string {
  const s = settings || loadPrintSettings();
  return (s.defaultOnlinePlatformPrinter || s.defaultKitchenPrinter || '').trim();
}

export function pickKitchenPrinterFromDevices(devices: PrinterDevice[]): string {
  if (!Array.isArray(devices) || devices.length === 0) return '';
  const names = devices.map((d) => (typeof d === 'string' ? d : d?.name || '')).filter(Boolean);
  const kw = ['mutfak', 'kitchen', 'mutfa', 'bar', 'grill', 'thermal', 'fis', 'fiş'];
  for (const k of kw) {
    const hit = names.find((n) => n.toLowerCase().includes(k));
    if (hit) return hit;
  }
  return names[0] || '';
}

/** Electron: ayarlardaki mantıksal adı Windows yazıcı listesiyle eşleştir. */
export async function resolveTargetThermalPrinterName(logicalName: string): Promise<string> {
  const devices = await getAvailablePrinters();
  const settings = loadPrintSettings();
  const tryNames: string[] = [];
  const push = (s: string | null | undefined) => {
    const t = (s || '').trim();
    if (t && !tryNames.includes(t)) tryNames.push(t);
  };
  push(logicalName);
  push(settings.defaultOnlinePlatformPrinter);
  push(settings.defaultKitchenPrinter);
  push(settings.defaultReceiptPrinter);
  for (const p of settings.printers) {
    if (p?.enabled && (p.type === 'kitchen' || p.type === 'bar' || p.type === 'custom') && p.printerName) {
      push(p.printerName);
    }
  }
  for (const c of tryNames) {
    const n = await resolveThermalDeviceName(c, devices);
    const use = ((n || '').trim() || c).trim();
    if (use) return use;
  }
  return pickKitchenPrinterFromDevices(devices);
}

export type PrintAgentStatus = 'connected' | 'not_running' | 'blocked_mixed_content' | 'unknown_error';

export async function checkPrintAgent(): Promise<boolean> {
  const result = await checkPrintAgentDetailed();
  return result.connected;
}

/** HTTPS üretim: tarayıcı `http://127.0.0.1:7878` isteğini mixed-content ile engeller; prob yapmaya gerek yok. */
async function checkPrintAgentPathForHttpsApp(): Promise<
  { connected: boolean; status: PrintAgentStatus; detail?: string } | null
> {
  if (window.location.protocol !== 'https:') return null;
  if (!(_currentTenantId || _currentBranchId)) {
    return {
      connected: false,
      status: 'blocked_mixed_content',
      detail: 'HTTPS ortamında yerel yazıcı köprüsü yok; kasa (Electron) açık ve giriş yapılmış olmalı.',
    };
  }
  try {
    const since = new Date(Date.now() - 60000).toISOString();
    let query = supabase
      .from('print_jobs')
      .select('id, status, updated_at')
      .in('status', ['done', 'processing', 'failed'])
      .gte('updated_at', since)
      .limit(1);
    if (_currentTenantId) {
      query = query.eq('tenant_id', _currentTenantId);
    } else if (_currentBranchId) {
      query = query.eq('branch_id', _currentBranchId);
    }
    const { data: jobs } = await query;
    if (jobs && jobs.length > 0) {
      return { connected: true, status: 'connected', detail: 'Supabase Realtime üzerinden' };
    }
    return { connected: true, status: 'connected', detail: 'Supabase Realtime hazır (henüz test edilmedi)' };
  } catch {
    return { connected: false, status: 'blocked_mixed_content', detail: 'HTTPS: yazıcı kuyruğu doğrulanamadı' };
  }
}

export async function checkPrintAgentDetailed(): Promise<{ connected: boolean; status: PrintAgentStatus; detail?: string }> {
  if (isElectron()) return { connected: false, status: 'unknown_error' };

  const httpsResult = await checkPrintAgentPathForHttpsApp();
  if (httpsResult) return httpsResult;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`${PRINT_AGENT_URL}/status`, { signal: controller.signal });
    clearTimeout(timeoutId);
    const data = await res.json();
    if (data.success === true) {
      return { connected: true, status: 'connected' };
    }
  } catch (err: any) {
    const msg = err?.message || '';
    const isHttps = window.location.protocol === 'https:';
    if (isHttps && (msg.includes('Failed to fetch') || msg.includes('NetworkError') || err?.name === 'TypeError')) {
      if (_currentTenantId || _currentBranchId) {
        try {
          const since = new Date(Date.now() - 60000).toISOString();
          let query = supabase
            .from('print_jobs')
            .select('id, status, updated_at')
            .in('status', ['done', 'processing', 'failed'])
            .gte('updated_at', since)
            .limit(1);
          if (_currentTenantId) {
            query = query.eq('tenant_id', _currentTenantId);
          } else if (_currentBranchId) {
            query = query.eq('branch_id', _currentBranchId);
          }
          const { data: jobs } = await query;
          if (jobs && jobs.length > 0) {
            return { connected: true, status: 'connected', detail: 'Supabase Realtime üzerinden' };
          }
          return { connected: true, status: 'connected', detail: 'Supabase Realtime hazır (henüz test edilmedi)' };
        } catch {
          return { connected: false, status: 'blocked_mixed_content', detail: 'HTTPS sayfasından HTTP isteği engellendi' };
        }
      }
      return { connected: false, status: 'blocked_mixed_content', detail: 'HTTPS sayfasından HTTP isteği engellendi' };
    }
    if (err?.name === 'AbortError') {
      return { connected: false, status: 'not_running', detail: 'Bağlantı zaman aşımına uğradı' };
    }
    return { connected: false, status: 'not_running', detail: 'Bağlantı reddedildi' };
  }

  return { connected: false, status: 'unknown_error', detail: 'Beklenmeyen yanıt' };
}

export async function getAvailablePrinters(): Promise<PrinterDevice[]> {
  const w = window as any;
  if (w.electronAPI?.getPrinters) {
    try {
      return await w.electronAPI.getPrinters();
    } catch {}
  }

  if (window.location.protocol !== 'https:') {
    try {
      const res = await fetch(`${PRINT_AGENT_URL}/printers`, { signal: AbortSignal.timeout(2000) });
      const data = await res.json();
      if (data.success && Array.isArray(data.printers)) return data.printers;
    } catch {}
  }

  if (_currentTenantId) {
    try {
      const { data } = await supabase
        .from('printer_registrations')
        .select('printers, last_seen_at')
        .eq('tenant_id', _currentTenantId)
        .order('last_seen_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data && Array.isArray(data.printers) && data.printers.length > 0) {
        return data.printers as PrinterDevice[];
      }
    } catch {}
  }

  return [];
}

export async function registerElectronPrinters(tenantId: string, branchId: string | null, userJwt: string): Promise<void> {
  const w = window as any;
  if (!w.electronAPI?.registerPrinters) {
    console.warn('[ŞefPOS] registerElectronPrinters: electronAPI.registerPrinters YOK — preload yüklenmemiş olabilir.');
    return;
  }
  try {
    console.log('[ŞefPOS] registerElectronPrinters çağrılıyor:', {
      tenantId,
      branchId,
      hasJwt: !!userJwt,
      jwtLen: userJwt?.length || 0,
    });
    const result = await w.electronAPI.registerPrinters({ tenantId, branchId, userJwt });
    console.log('[ŞefPOS] registerElectronPrinters sonuç:', result);
  } catch (err: any) {
    console.error('[ŞefPOS] registerElectronPrinters HATA:', err?.message || err);
  }
}

function fmt(n: number) {
  return n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function moneyFmt(n: number) {
  return formatMoneyReceipt(n, getActiveCurrencyCode());
}

function pad(str: string, len: number, right = false): string {
  const s = String(str);
  if (s.length >= len) return s.substring(0, len);
  const spaces = ' '.repeat(len - s.length);
  return right ? spaces + s : s + spaces;
}

function row(name: string, qty: string, price: string): string {
  return `<div class="row"><span class="name">${name}</span><span class="qty">${qty}</span><span class="price">${price}</span></div>`;
}

export interface KitchenPrintItem {
  productName: string;
  variantName?: string | null;
  quantity: number;
  notes?: string | null;
  categoryId?: string | null;
  productPrinterName?: string | null;
}

export interface ReceiptPrintItem {
  productName: string;
  variantName?: string | null;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  notes?: string | null;
}

function kitchenStyleBlock(st: PrintStyleSettings): string {
  const scope = '.sefpos-kitchen-scope';
  const noteFs = Math.max(st.kitchenBodyPx + 2, 14);
  const optFs = Math.max(st.kitchenBodyPx + 1, 12);
  const off = clampOffsetMm(st.paperOffsetMm);
  const wTitle = printWeight(st.kitchenTitleBold, true);
  const wProduct = printWeight(st.kitchenProductBold, true);
  // Termal yazıcılarda siyah dolgu (background:#000) sönük/silik basıyor.
  // Bu yüzden notlar artık BEYAZ arka plan + KALIN SİYAH ÇERÇEVE + SİYAH YAZI
  // olarak basılır. Hem net okunur hem termal şerit ekonomik kullanılır.
  return `<style>
  ${scope} { font-family: Arial, Helvetica, "Segoe UI", sans-serif; font-size: ${st.kitchenBodyPx}px !important; line-height: 1.3; color:#000; -webkit-print-color-adjust: exact; print-color-adjust: exact; margin-left: ${off}mm; margin-right: ${-off}mm; }
  ${scope} .xlarge { font-size: ${st.kitchenTitlePx}px !important; font-weight: ${wTitle} !important; }
  ${scope} .large { font-size: ${Math.max(st.kitchenBodyPx + 1, 13)}px !important; font-weight: ${wTitle} !important; }
  ${scope} .row.bold.xlarge { font-size: ${st.kitchenItemPx}px !important; font-weight: ${wTitle} !important; }
  ${scope} .subtitle { font-size: ${Math.max(st.kitchenBodyPx - 1, 10)}px !important; text-align: center; margin: 2px 0; }
  ${scope} .header-meta { font-size: ${Math.max(st.kitchenBodyPx - 1, 10)}px !important; }
  ${scope} .item-block { padding: 4px 0 6px 0; }
  ${scope} .item-row .name { width: 80% !important; font-size: ${st.kitchenItemPx}px !important; font-weight: ${wProduct} !important; color:#000 !important; }
  ${scope} .item-row .qty  { width: 20% !important; text-align: right !important; font-size: ${st.kitchenItemPx}px !important; font-weight: ${printWeight(st.kitchenProductBold)} !important; color:#000 !important; }
  ${scope} .opt-line { font-size: ${optFs}px !important; font-weight: 800; color:#000; padding: 3px 0 3px 10px; border-left: 4px solid #000; margin: 4px 0 4px 6px; }
  ${scope} .note-line { font-size: ${noteFs}px !important; font-weight: 900 !important; color:#000 !important; background:#fff; border: 2px solid #000; padding: 5px 7px; margin: 5px 0 5px 4px; border-radius: 2px; letter-spacing: 0.3px; }
  ${scope} .item-sep { border: 0; border-top: 1px dashed #000; margin: 4px 0 0 0; }
  ${scope} .general-note { font-size: ${noteFs}px !important; font-weight: 900 !important; color:#000 !important; background:#fff; border: 3px solid #000; padding: 6px 8px; margin: 6px 0; border-radius: 2px; text-align: center; letter-spacing: 0.4px; }
  ${scope} .footer { font-size: ${Math.max(st.kitchenBodyPx - 2, 9)}px !important; }
  ${scope} .extra-line { font-size: ${Math.max(st.kitchenBodyPx - 1, 10)}px !important; text-align: center; margin: 4px 0; }
</style>`;
}

function receiptStyleBlock(st: PrintStyleSettings): string {
  const scope = '.sefpos-receipt-scope';
  const off = clampOffsetMm(st.paperOffsetMm);
  const wTitle = printWeight(st.receiptTitleBold, true);
  const wBody = printWeight(st.receiptProductBold);
  const wTotal = printWeight(st.receiptTotalBold, true);
  return `<style>
  ${scope} { font-family: Arial, Helvetica, "Segoe UI", sans-serif; font-size: ${st.receiptBodyPx}px !important; line-height: 1.3; color:#000; margin-left: ${off}mm; margin-right: ${-off}mm; }
  ${scope} .xlarge { font-size: ${st.receiptTitlePx}px !important; font-weight: ${wTitle} !important; }
  ${scope} .large { font-size: ${Math.max(st.receiptBodyPx + 2, 13)}px !important; font-weight: ${wTitle} !important; }
  ${scope} .bold { font-weight: ${wBody} !important; }
  ${scope} .subtitle { font-size: ${Math.max(st.receiptBodyPx - 1, 10)}px !important; text-align: center; margin: 2px 0; }
  ${scope} .row { display: flex; justify-content: space-between; width: 100%; }
  ${scope} .total-row { display: flex; justify-content: space-between; width: 100%; }
  ${scope} .note { font-size: ${Math.max(st.receiptBodyPx, 11)}px !important; font-weight: 700; color:#000; }
  ${scope} .footer { font-size: ${Math.max(st.receiptBodyPx - 2, 9)}px !important; }
  ${scope} .extra-line { font-size: ${Math.max(st.receiptBodyPx - 1, 10)}px !important; text-align: center; margin: 4px 0; }
  ${scope} .total-row { font-size: ${Math.max(st.receiptBodyPx + 2, 14)}px !important; font-weight: ${wTotal} !important; }
  ${scope} .total-row span { font-weight: ${wTotal} !important; }
</style>`;
}

/**
 * Paket/kurye fişi: tutar ve iki sütunlu satırlar (tarih, sipariş no) sağa yapışmasın.
 * Electron yazdırıcı sarmalayıcısı `display:table-cell` kullanır; yüzde genişlikler buna göre.
 */
function takeawayReceiptAlignStyles(st: PrintStyleSettings): string {
  const wProduct = printWeight(st.receiptProductBold);
  const wTotal = printWeight(st.receiptTotalBold, true);
  return `<style>
    .sefpos-receipt-scope .row { width: 100% !important; }
    .sefpos-receipt-scope .row .name  { width: 60% !important; font-weight: ${wProduct} !important; color: #000 !important; padding-right: 1mm !important; }
    .sefpos-receipt-scope .row .qty   { width: 14% !important; font-weight: ${printWeight(st.receiptProductBold)} !important; color: #000 !important; text-align: center !important; }
    .sefpos-receipt-scope .row .price { width: 26% !important; font-weight: ${wProduct} !important; color: #000 !important; text-align: right !important; padding-right: 2mm !important; }
    .sefpos-receipt-scope .row > span:first-child:not(.name):not(.qty):not(.price) {
      width: 74% !important; text-align: left !important; font-weight: ${printWeight(st.receiptProductBold)} !important; color: #000 !important;
    }
    .sefpos-receipt-scope .row > span:last-child:not(.name):not(.qty):not(.price) {
      width: 26% !important; text-align: right !important; font-weight: ${wProduct} !important; color: #000 !important; padding-right: 2mm !important;
    }
    .sefpos-receipt-scope .total-row { width: 100% !important; font-weight: ${wTotal} !important; }
    .sefpos-receipt-scope .total-row span:first-child { width: 74% !important; text-align: left !important; font-weight: ${wTotal} !important; }
    .sefpos-receipt-scope .total-row span:last-child  { width: 26% !important; text-align: right !important; padding-right: 2mm !important; font-weight: ${wTotal} !important; }
  </style>`;
}

function escHtml(s: string | null | undefined): string {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildKitchenHtml(opts: {
  restaurantName: string;
  tableLabel: string;
  orderNumber: string;
  items: KitchenPrintItem[];
  note?: string;
  time?: string;
  /** Siparişi alan garson — mutfak başlığında belirgin görünür. */
  waiterName?: string;
  printStyle?: PrintStyleSettings;
}): string {
  const st = opts.printStyle || DEFAULT_PRINT_STYLE;
  const time = opts.time || new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  const date = new Date().toLocaleDateString('tr-TR');

  let html = kitchenStyleBlock(st);
  html += `<div class="sefpos-kitchen-scope">`;
  html += `
    <div class="center bold xlarge">${escHtml(opts.restaurantName) || 'MUTFAK FİŞİ'}</div>
    ${st.kitchenSubtitle ? `<div class="subtitle">${escHtml(st.kitchenSubtitle)}</div>` : ''}
    <div class="line"></div>
    <div class="center bold large">${escHtml(opts.tableLabel)}</div>
    <div class="center header-meta">${date} ${time}</div>
    ${st.showKitchenOrderNumber && opts.orderNumber ? `<div class="center header-meta">Sipariş: ${escHtml(opts.orderNumber)}</div>` : ''}
    ${opts.waiterName ? `<div class="center header-meta bold">Garson: ${escHtml(opts.waiterName)}</div>` : ''}
    <div class="line"></div>
    <div class="row bold">
      <span class="name">URUN</span><span class="qty">ADT</span><span class="price"></span>
    </div>
    <div class="line"></div>
  `;

  opts.items.forEach((item, idx) => {
    html += `<div class="item-block">`;
    html += `
      <div class="row item-row">
        <span class="name">${escHtml(item.productName)}</span>
        <span class="qty">x${item.quantity}</span>
      </div>
    `;
    if (item.variantName) {
      html += `<div class="opt-line">↳ Seçenek: ${escHtml(item.variantName)}</div>`;
    }
    if (item.notes && item.notes.trim()) {
      html += `<div class="note-line">NOT: ${escHtml(item.notes)}</div>`;
    }
    html += `</div>`;
    if (idx < opts.items.length - 1) {
      html += `<hr class="item-sep" />`;
    }
  });

  if (opts.note && opts.note.trim()) {
    html += `<div class="line"></div><div class="general-note">GENEL NOT: ${escHtml(opts.note)}</div>`;
  }

  html += `<div class="line"></div>`;
  if (st.kitchenFooterExtra) {
    html += `<div class="extra-line">${escHtml(st.kitchenFooterExtra)}</div>`;
  }
  html += `<div class="footer">*** MUTFAK KOPYASI ***</div>`;
  html += `<br><br><br>`;
  html += `</div>`;

  return html;
}

export function buildReceiptHtml(opts: {
  restaurantName: string;
  restaurantPhone?: string;
  restaurantAddress?: string;
  tableLabel: string;
  orderNumber: string;
  items: ReceiptPrintItem[];
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  total: number;
  paymentMethod?: string;
  footer?: string;
  waiterName?: string;
  printStyle?: PrintStyleSettings;
}): string {
  const st = opts.printStyle || DEFAULT_PRINT_STYLE;
  const time = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  const date = new Date().toLocaleDateString('tr-TR');

  const paymentLabels: Record<string, string> = {
    cash: 'Nakit',
    credit_card: 'Kredi Kartı',
    open_account: 'Veresiye',
    mixed: 'Karışık',
  };

  let html = receiptStyleBlock(st);
  html += `<div class="sefpos-receipt-scope">`;
  html += `
    <div class="center bold xlarge">${opts.restaurantName || 'ŞefPOS'}</div>
    ${st.receiptSubtitle ? `<div class="subtitle">${st.receiptSubtitle}</div>` : ''}
    ${opts.restaurantAddress ? `<div class="center" style="font-size:${Math.max(st.receiptBodyPx - 1, 10)}px">${opts.restaurantAddress}</div>` : ''}
    ${opts.restaurantPhone ? `<div class="center" style="font-size:${Math.max(st.receiptBodyPx - 1, 10)}px">Tel: ${opts.restaurantPhone}</div>` : ''}
    <div class="line"></div>
    <div class="row"><span>Tarih:</span><span>${date} ${time}</span></div>
    <div class="row"><span>Masa:</span><span>${opts.tableLabel}</span></div>
    ${opts.orderNumber ? `<div class="row"><span>Sipariş No:</span><span>${opts.orderNumber}</span></div>` : ''}
    ${opts.waiterName ? `<div class="row"><span>Garson:</span><span>${opts.waiterName}</span></div>` : ''}
    <div class="line"></div>
    <div class="row bold">
      <span class="name">URUN</span><span class="qty">ADT</span><span class="price">TUTAR</span>
    </div>
    <div class="line"></div>
  `;

  opts.items.forEach(item => {
    const label = item.variantName ? `${item.productName} (${item.variantName})` : item.productName;
    html += row(label, `${item.quantity}x`, moneyFmt(item.unitPrice));
    if (item.quantity > 1) {
      html += `<div class="row"><span class="name"></span><span class="qty"></span><span class="price bold">${moneyFmt(item.totalAmount)}</span></div>`;
    }
    if (item.notes) {
      html += `<div class="note">Not: ${item.notes}</div>`;
    }
  });

  html += `<div class="line"></div>`;
  html += `<div class="row"><span>Ara Toplam</span><span>${moneyFmt(opts.subtotal)}</span></div>`;
  if (opts.taxAmount > 0) {
    html += `<div class="row"><span>KDV</span><span>${moneyFmt(opts.taxAmount)}</span></div>`;
  }
  if (opts.discountAmount > 0) {
    html += `<div class="row"><span>İndirim</span><span>-${moneyFmt(opts.discountAmount)}</span></div>`;
  }
  html += `<div class="line"></div>`;
  html += `<div class="total-row" style="font-size:${Math.max(st.receiptBodyPx + 2, 14)}px"><span>TOPLAM</span><span>${moneyFmt(opts.total)}</span></div>`;
  if (opts.paymentMethod) {
    html += `<div class="row"><span>Ödeme</span><span>${paymentLabels[opts.paymentMethod] || opts.paymentMethod}</span></div>`;
  }
  html += `<div class="line"></div>`;
  if (st.receiptFooterExtra) {
    html += `<div class="extra-line">${st.receiptFooterExtra}</div>`;
  }
  html += `<div class="footer">${opts.footer || 'Teşekkür ederiz, iyi günler!'}</div>`;
  html += `<div class="line" style="margin-top:6px"></div>`;
  html += `<div class="center" style="font-size:${Math.max(st.receiptBodyPx - 2, 9)}px; margin-top:4px">Bilgi fişidir. Mali değeri yoktur.</div>`;
  html += `<br><br><br>`;
  html += `</div>`;

  return html;
}

/**
 * Yazdırma sonuçlarını UI'a duyurur. `silent` true verilirse hiçbir toast atılmaz
 * (örn. test fişlerinde manuel başarı popup'ı zaten gösteriliyorsa).
 */
function notifyPrintResult(opts: {
  success: boolean;
  printerName: string;
  errorDetail?: string;
  channel?: 'electron' | 'queue' | 'agent' | 'browser';
  toastTitle?: string;
  silent?: boolean;
}): void {
  if (opts.silent) return;
  const target = opts.printerName || undefined;
  if (opts.success) {
    if (opts.channel === 'browser') {
      dispatchPrintToast({
        kind: 'success',
        message: opts.toastTitle || 'Yazdırma penceresi açıldı',
        target,
        detail: 'Termal yazıcınızı seçip Yazdır deyin (Getir paneli gibi).',
      });
    } else if (opts.channel === 'queue') {
      // Web/mobilde gerçek yazıcı yok — kasadaki Print Agent basacak.
      // "Kuyruğa eklendi" tek başına "çıkmadı mı acaba?" izlenimi verebildiği
      // için pozitif ve net bir cümle kullanıyoruz.
      dispatchPrintToast({
        kind: 'success',
        message: opts.toastTitle || 'Mutfağa gönderildi',
        target,
        detail: 'Kasadaki yazıcıdan otomatik basılacak.',
      });
    } else {
      dispatchPrintToast({
        kind: 'success',
        message: opts.toastTitle || 'Yazdırıldı',
        target,
      });
    }
  } else {
    dispatchPrintToast({
      kind: 'error',
      message: 'Yazıcıya ulaşılamadı',
      target,
      detail: opts.errorDetail || 'Bilinmeyen hata.',
    });
  }
}

/** 80 mm termal fiş — tarayıcı yazdırma penceresi (web / www, Getir paneli gibi). */
function buildBrowserThermalDocument(bodyHtml: string, title = 'ŞefPOS Fiş'): string {
  const st = loadPrintSettings().printStyle || DEFAULT_PRINT_STYLE;
  const off = clampOffsetMm(st.paperOffsetMm);
  const safeTitle = escHtml(title);
  return `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="utf-8" />
<title>${safeTitle}</title>
<style>
  @page { size: 80mm auto; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: Arial, Helvetica, "Segoe UI", sans-serif;
    font-size: 12px;
    width: 76mm;
    max-width: 76mm;
    padding: 4px;
    margin-left: ${off}mm;
    color: #000;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .center { text-align: center; }
  .bold { font-weight: bold; }
  .large { font-size: 14px; }
  .xlarge { font-size: 16px; }
  .line { border-top: 1px dashed #000; margin: 4px 0; }
  .row { display: flex; justify-content: space-between; width: 100%; }
  .name { flex: 1; overflow: hidden; }
  .qty { width: 36px; text-align: right; }
  .price { width: 80px; text-align: right; }
  .note { font-size: 11px; font-style: italic; padding-left: 8px; }
  .footer { text-align: center; font-size: 11px; margin-top: 4px; }
  .total-row { display: flex; justify-content: space-between; font-weight: bold; font-size: 14px; }
  @media print { body { width: 76mm; } }
</style>
</head>
<body>
${bodyHtml}
<br><br><br>
</body>
</html>`;
}

/** Kullanıcı tıklamasıyla: yazdırma penceresi (pop-up). */
async function printHtmlViaBrowser(
  html: string,
  title?: string
): Promise<{ success: boolean; error?: string }> {
  if (typeof window === 'undefined') return { success: false, error: 'Tarayıcı yok' };
  const doc = buildBrowserThermalDocument(html, title || 'ŞefPOS');
  const w = window.open('', 'sefpos-thermal-print', 'width=420,height=800');
  if (!w) {
    return { success: false, error: 'Pop-up engellendi — tarayıcıda bu site için açılır pencereye izin verin.' };
  }
  w.document.open();
  w.document.write(doc);
  w.document.close();
  w.focus();
  const tryPrint = () => {
    try {
      w.print();
    } catch {
      /* sessiz */
    }
  };
  if (w.document.readyState === 'complete') {
    setTimeout(tryPrint, 280);
  } else {
    w.addEventListener('load', () => setTimeout(tryPrint, 280));
  }
  w.addEventListener('afterprint', () => {
    setTimeout(() => {
      try {
        w.close();
      } catch {
        /* sessiz */
      }
    }, 400);
  });
  return { success: true };
}

/** Otomatik onay (sessiz): gizli iframe — mümkünse dialog göstermeden basar. */
async function printHtmlViaBrowserSilent(html: string): Promise<{ success: boolean; error?: string }> {
  if (typeof window === 'undefined') return { success: false, error: 'Tarayıcı yok' };
  return new Promise((resolve) => {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;border:0';
    document.body.appendChild(iframe);
    const win = iframe.contentWindow;
    const doc = win?.document;
    if (!win || !doc) {
      iframe.remove();
      resolve({ success: false, error: 'iframe oluşturulamadı' });
      return;
    }
    doc.open();
    doc.write(buildBrowserThermalDocument(html));
    doc.close();
    setTimeout(() => {
      try {
        win.focus();
        win.print();
        resolve({ success: true });
      } catch (err: any) {
        resolve({ success: false, error: err?.message || 'print blocked' });
      }
      setTimeout(() => {
        try {
          iframe.remove();
        } catch {
          /* sessiz */
        }
      }, 8000);
    }, 450);
  });
}

/** Yerel Print Agent (127.0.0.1:7878) — Electron kapalı olsa da çalışır. */
async function tryLocalPrintAgent(
  html: string,
  printerName: string
): Promise<{ success: boolean; error?: string } | null> {
  if (!shouldTryExternalPrintAgent()) return null;
  try {
    const res = await fetch(`${PRINT_AGENT_URL}/print`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ html, printerName: printerName || undefined, silent: true }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json();
    if (data?.success) return { success: true };
    return { success: false, error: data?.error || data?.errorType || 'Print Agent başarısız' };
  } catch {
    printAgentBackoffUntil = Date.now() + PRINT_AGENT_BACKOFF_MS;
    return null;
  }
}

const DEFAULT_SUPABASE_FN_BASE =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '') ||
  'https://xdfnozfuuzctubijbnds.supabase.co';

/** Edge `online-order-reprint` ile onay fişi HTML üretir. */
export async function fetchOnlineOrderReceiptHtml(
  onlineOrderId: string,
  directPrint = true
): Promise<string | null> {
  const { data: sess } = await supabase.auth.getSession();
  const token = sess?.session?.access_token;
  if (!token) return null;
  const res = await fetch(`${DEFAULT_SUPABASE_FN_BASE}/functions/v1/online-order-reprint`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ onlineOrderId, directPrint }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok) return null;
  return typeof data.html === 'string' ? data.html : null;
}

/** Getir / platform onay fişi — önce yerel agent/Electron, sonra kuyruk. */
export async function printOnlineOrderReceiptFromEdge(
  onlineOrderId: string,
  opts?: { printerName?: string; title?: string; silent?: boolean }
): Promise<{ success: boolean; error?: string }> {
  const html = await fetchOnlineOrderReceiptHtml(onlineOrderId, true);
  if (!html) {
    return { success: false, error: 'Fiş oluşturulamadı' };
  }
  const settings = loadPrintSettings();
  let printer = (opts?.printerName || getOnlinePlatformPrinterName(settings)).trim();
  if (isElectron()) {
    printer = await resolveTargetThermalPrinterName(printer);
  }
  return printHtml(html, printer, {
    title: opts?.title || 'Online sipariş fişi',
    silent: opts?.silent,
    allowBrowserFallback: true,
  });
}

/**
 * Yazdırma akışı:
 *
 * 1. Electron — sessiz termal.
 * 2. Yerel Print Agent (7878).
 * 3. **Web (www) — tarayıcı yazdırma** (yalnızca `allowBrowserFallback`; Getir/YS/TY uzaktan).
 * 4. `print_jobs` kuyruğu (uzaktan kasa / agent).
 */
export async function printHtml(
  html: string,
  printerName: string,
  toastOpts?: { title?: string; silent?: boolean; /** Web: tarayıcı yazdırma penceresi (online platform) */ allowBrowserFallback?: boolean }
): Promise<{ success: boolean; error?: string }> {
  const w = window as any;
  const silent = toastOpts?.silent === true;
  const title = toastOpts?.title;

  // 1) Electron — yerel yazıcı (OS adı çözümle + varsayılan yazıcı yedek).
  if (w.electronAPI?.printReceipt) {
    const resolved = await resolveTargetThermalPrinterName(printerName);
    const tryNames = [resolved, ''].filter((n, i, a) => a.indexOf(n) === i);
    let lastErr: string | undefined;
    for (const name of tryNames) {
      try {
        const result = await w.electronAPI.printReceipt({
          html,
          printerName: name || undefined,
          silent: true,
        });
        if (result.success) {
          notifyPrintResult({
            success: true,
            printerName: name || resolved,
            channel: 'electron',
            toastTitle: title,
            silent,
          });
          return { success: true };
        }
        lastErr = result.errorType || result.error || undefined;
    } catch (err: any) {
        lastErr = err?.message;
      }
    }
    notifyPrintResult({
      success: false,
      printerName: resolved,
      errorDetail: lastErr,
      channel: 'electron',
      toastTitle: title,
      silent,
    });
    // Electron aynı makinede print_jobs kuyruğunu da dinler — aşağıdaki adımlara düş.
  }

  // 2) Yerel Print Agent — www veya Electron UI kapalı olsa da (aynı PC).
  const agentHit = await tryLocalPrintAgent(html, printerName);
  if (agentHit?.success) {
    notifyPrintResult({
      success: true,
      printerName,
      channel: 'agent',
      toastTitle: title,
      silent,
    });
    return { success: true };
  }

  // 3) Web — tarayıcı yazdırma (yalnızca online platform siparişleri; masa/mutfak değil).
  if (!isElectron() && toastOpts?.allowBrowserFallback === true) {
    const browserResult = silent
      ? await printHtmlViaBrowserSilent(html)
      : await printHtmlViaBrowser(html, title || 'ŞefPOS Fiş');
    if (browserResult.success) {
      notifyPrintResult({
        success: true,
        printerName,
        channel: 'browser',
        toastTitle: title,
        silent,
      });
      return { success: true };
    }
    if (!silent && browserResult.error?.includes('Pop-up')) {
      notifyPrintResult({
        success: false,
        printerName,
        errorDetail: browserResult.error,
        channel: 'browser',
        silent,
      });
    }
  }

  // 4) Web / mobil — Supabase print_jobs kuyruğu (uzak kasa veya otomatik yedek).
  // Tenant veya branch ID set edilmişse (login sonrası AuthContext bunu yapar),
  // Electron Print Agent kuyruğu Realtime ile dinler ve basar.
  if (_currentTenantId || _currentBranchId) {
    try {
      const { data, error } = await supabase
        .from('print_jobs')
        .insert({
        tenant_id: _currentTenantId || null,
        branch_id: _currentBranchId || null,
        html,
        printer_name: printerName || '',
        status: 'pending',
        })
        .select('id')
        .maybeSingle();
      if (!error) {
        // Teşhis: kasadaki Print Agent bu ID'yi Realtime ile alıp basmalı.
        // Konsolda göz at → eğer yazıcı çıkmadıysa kasanın Sefpos.exe'sini
        // kontrol et (açık mı, login mi, agent_status connected mi).
        posDebugLog('[ŞefPOS] print job kuyruğa eklendi:', {
          id: data?.id,
          printer: printerName || '(boş — varsayılan)',
          tenant: _currentTenantId,
          branch: _currentBranchId,
        });
        notifyPrintResult({ success: true, printerName, channel: 'queue', toastTitle: title, silent });
        return { success: true };
      }
      // Insert başarısız (RLS / network). Kullanıcıya "yazıcıya ulaşılamadı"
      // demek yanıltıcı (sipariş zaten kayıtlı). Sadece konsola yaz ve nazik
      // bilgi ver. Sipariş geçti, mutfak fişi şimdilik yok.
      console.warn('[ŞefPOS] print_jobs insert başarısız:', {
        message: error.message,
        code: (error as any).code,
        details: (error as any).details,
        hint: (error as any).hint,
        tenant: _currentTenantId,
        branch: _currentBranchId,
      });
      if (!silent) {
        dispatchPrintToast({
          kind: 'queued',
          message: 'Sipariş kaydedildi',
          target: printerName || undefined,
          detail: 'Mutfak fişi bağlantı düzelince kasadan basılacak.',
        });
      }
      return { success: false, error: error.message };
    } catch (err: any) {
      console.warn('[ŞefPOS] print_jobs insert exception:', err?.message);
      if (!silent) {
        dispatchPrintToast({
          kind: 'queued',
          message: 'Sipariş kaydedildi',
          target: printerName || undefined,
          detail: 'Mutfak fişi bağlantı düzelince kasadan basılacak.',
        });
      }
      return { success: false, error: err?.message };
    }
  }

  // 5) Son çare — agent tekrar (tenant yokken yukarıdaki adım atlanmış olabilir).
  const agentRetry = await tryLocalPrintAgent(html, printerName);
  if (agentRetry) {
    notifyPrintResult({
      success: agentRetry.success,
      printerName,
      errorDetail: agentRetry.error,
      channel: 'agent',
      toastTitle: title,
      silent,
    });
    return agentRetry;
  }

  if (!silent) {
    dispatchPrintToast({
      kind: 'queued',
      message: 'Sipariş kaydedildi',
      detail: 'Yazıcı çevrimdışı; Print Agent veya kasa açılınca basılacak.',
    });
  }
  return { success: false, error: 'Print Agent yok' };
}

/**
 * Müşteri adisyonu. Öncelik: Ayarlardaki adisyon yazıcısı; yoksa mutfak varsayılanı,
 * sonra receipt tipi eşleşmiş yazıcı. Web/mobilde hiçbiri yoksa bile `print_jobs`
 * kuyruğuna boş isimle düşer (kasadaki Electron varsayılan / yazıcı listesi basar)
 * — mutfak fişiyle aynı strateji.
 */
export async function printToAdisyonPrinter(
  settings: PrintSettings,
  html: string,
  toastOpts?: { title?: string; silent?: boolean }
): Promise<{ success: boolean; error?: string }> {
  // Mobil / web fast path — yazıcı çözümlemesi yok, direkt kuyruğa.
  // Electron Print Agent kuyruktan alır almaz kasanın varsayılan adisyon
  // yazıcısına basar (printer_name boş → pickDefaultKitchenPrinter fallback).
  if (!isElectron()) {
    const title = toastOpts?.title || 'Adisyon kasaya gönderildi';
    posDebugLog('[ŞefPOS] Adisyon: mobil/web tarafından kuyruğa eklendi.');
    return printHtml(html, '', { title, silent: toastOpts?.silent });
  }

  const devices = await getAvailablePrinters();
  const tryNames: string[] = [];
  const push = (s: string | null | undefined) => {
    const t = (s || '').trim();
    if (t && !tryNames.includes(t)) tryNames.push(t);
  };
  push(getAdisyonPrinterName(settings));
  push(settings.defaultKitchenPrinter);
  for (const p of settings.printers) {
    if (p?.enabled && p.type === 'receipt' && p.printerName) push(p.printerName);
  }

  let resolved = '';
  for (const c of tryNames) {
    const n = await resolveThermalDeviceName(c, devices);
    const use = ((n || '').trim() || c).trim();
    if (use) {
      resolved = use;
      break;
    }
  }

  if (!resolved) {
    resolved = pickKitchenPrinterFromDevices(devices);
  }

  const title =
    toastOpts?.title ||
    (resolved ? 'Adisyon yazdırıldı' : 'Adisyon kasaya gönderildi');

  return printHtml(html, resolved, { title, silent: toastOpts?.silent });
}

export function buildTakeawayHtml(opts: {
  restaurantName: string;
  restaurantPhone?: string;
  restaurantAddress?: string;
  orderNumber: string;
  orderType: 'takeaway' | 'delivery';
  customerName?: string;
  customerPhone?: string;
  deliveryAddress?: string;
  deliveryNote?: string;
  courierName?: string;
  estimatedMinutes?: number;
  items: ReceiptPrintItem[];
  subtotal: number;
  total: number;
  paymentMethod?: string;
  footer?: string;
  printStyle?: PrintStyleSettings;
}): string {
  const st = opts.printStyle || DEFAULT_PRINT_STYLE;
  const time = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  const date = new Date().toLocaleDateString('tr-TR');
  const isDelivery = opts.orderType === 'delivery';
  const fs = Math.max(st.receiptBodyPx - 1, 10);

  // Başlık: kullanıcı ayarlardan girdiği restoran/ünvan adı her zaman önceliklidir;
  // boşsa hardcoded "ŞefPOS" yerine sessizce boş bırakırız (AuthContext bu durumda
  // tenant adıyla otomatik doldurur — bkz. printService.setupRestaurantHeaderFromTenant).
  const headerName = (opts.restaurantName || '').trim();

  // Paket fişi çoğu yazıcıda hafif sağa kaçar; -1 mm varsayılan sol düzeltme (Ayarlar’daki kayma üstüne).
  const stTakeaway = { ...st, paperOffsetMm: clampOffsetMm(st.paperOffsetMm - 1) };
  let html = receiptStyleBlock(stTakeaway);
  html += takeawayReceiptAlignStyles(st);
  html += `<style>
    .sefpos-receipt-scope .item-divider { border-top: 1px dashed #000; margin: 3px 0; width: 100%; opacity: 0.85; }
    .sefpos-receipt-scope .cust-section { margin: 6px 0; padding: 4px 0; border-top: 1px dashed #000; border-bottom: 1px dashed #000; }
    .sefpos-receipt-scope .cust-row { display: flex; justify-content: space-between; gap: 8px; margin: 2px 0; }
    .sefpos-receipt-scope .cust-row .label { font-weight: 900; }
    .sefpos-receipt-scope .cust-row .value { font-weight: 800; text-align: right; flex: 1; padding-right: 2mm; }
    .sefpos-receipt-scope .addr-title { font-weight: 900; letter-spacing: 0.4px; text-align: center; margin: 4px 0 2px; }
    .sefpos-receipt-scope .addr-text { font-weight: 800; line-height: 1.35; text-align: center; margin: 0 2mm; }
  </style>`;
  html += `<div class="sefpos-receipt-scope">`;
  if (headerName) {
    html += `<div class="center bold xlarge">${escHtml(headerName)}</div>`;
  }
  if (st.receiptSubtitle) {
    html += `<div class="subtitle">${escHtml(st.receiptSubtitle)}</div>`;
  }
  if (opts.restaurantAddress) {
    html += `<div class="center" style="font-size:${fs}px">${escHtml(opts.restaurantAddress)}</div>`;
  }
  if (opts.restaurantPhone) {
    html += `<div class="center" style="font-size:${fs}px">Tel: ${escHtml(opts.restaurantPhone)}</div>`;
  }
  html += `<div class="line"></div>`;
  html += `<div class="center bold large">${isDelivery ? 'KURYE SIPARISI' : 'PAKET SERVIS'}</div>`;
  html += `<div class="line"></div>`;
  html += `<div class="row"><span>Tarih:</span><span>${date} ${time}</span></div>`;
  if (opts.orderNumber) {
    html += `<div class="row"><span>Siparis No:</span><span>${escHtml(opts.orderNumber)}</span></div>`;
  }

  // Musteri bilgileri — sade tek bolme. Cerceve yok; ust/alt kesik cizgi ile
  // ayrilir. Sirasiyla: Musteri (ad), Telefon, ADRES baslik + adres metni,
  // varsa Not / Kurye / Tahmini sure.
  const hasCustomerInfo = !!(
    opts.customerName ||
    opts.customerPhone ||
    opts.deliveryAddress ||
    opts.courierName ||
    opts.estimatedMinutes
  );
  if (hasCustomerInfo) {
    html += `<div class="cust-section">`;
    if (opts.customerName) {
      html += `<div class="cust-row"><span class="label">Musteri:</span><span class="value">${escHtml(opts.customerName)}</span></div>`;
    }
    if (opts.customerPhone) {
      html += `<div class="cust-row"><span class="label">Telefon:</span><span class="value">${escHtml(opts.customerPhone)}</span></div>`;
    }
    if (opts.deliveryAddress) {
      html += `<div class="addr-title">${isDelivery ? 'TESLIMAT ADRESI' : 'MUSTERI ADRESI'}</div>`;
      html += `<div class="addr-text">${escHtml(opts.deliveryAddress)}</div>`;
      if (opts.deliveryNote) {
        html += `<div class="addr-text" style="margin-top:3px">Not: ${escHtml(opts.deliveryNote)}</div>`;
      }
    }
    if (opts.courierName) {
      html += `<div class="cust-row"><span class="label">Kurye:</span><span class="value">${escHtml(opts.courierName)}</span></div>`;
    }
    if (opts.estimatedMinutes) {
      html += `<div class="cust-row"><span class="label">Tahmini Sure:</span><span class="value">${opts.estimatedMinutes} dk</span></div>`;
    }
    html += `</div>`;
  }

  html += `<div class="line"></div>`;
  html += `<div class="row bold"><span class="name">URUN</span><span class="qty">ADT</span><span class="price">TUTAR</span></div>`;
  html += `<div class="line"></div>`;

  opts.items.forEach((item, idx) => {
    const label = item.variantName ? `${item.productName} (${item.variantName})` : item.productName;
    html += row(escHtml(label), `${item.quantity}x`, moneyFmt(item.unitPrice));
    if (item.quantity > 1) {
      html += `<div class="row"><span class="name"></span><span class="qty"></span><span class="price bold">${moneyFmt(item.totalAmount)}</span></div>`;
    }
    if (item.notes) {
      html += `<div class="note">Not: ${escHtml(item.notes)}</div>`;
    }
    // Ürünler arasına ince kesik çizgi (son üründen sonra koymayız — toplam line zaten geliyor)
    if (idx < opts.items.length - 1) {
      html += `<div class="item-divider"></div>`;
    }
  });

  html += `<div class="line"></div>`;
  html += `<div class="total-row" style="font-size:${Math.max(st.receiptBodyPx + 2, 14)}px"><span>TOPLAM</span><span>${moneyFmt(opts.total)}</span></div>`;
  html += `<div class="line"></div>`;
  if (st.receiptFooterExtra) {
    html += `<div class="extra-line">${escHtml(st.receiptFooterExtra)}</div>`;
  }
  html += `<div class="footer">${escHtml(opts.footer || 'Tesekkur ederiz!')}</div>`;
  html += `<br><br><br>`;
  html += `</div>`;
  return html;
}

export async function printTakeawayReceipt(opts: {
  settings: PrintSettings;
  orderType: 'takeaway' | 'delivery';
  orderNumber: string;
  customerName?: string;
  customerPhone?: string;
  deliveryAddress?: string;
  deliveryNote?: string;
  courierName?: string;
  estimatedMinutes?: number;
  items: ReceiptPrintItem[];
  subtotal: number;
  total: number;
}): Promise<void> {
  const { settings } = opts;

  const html = buildTakeawayHtml({
    restaurantName: settings.restaurantName,
    restaurantPhone: settings.restaurantPhone,
    restaurantAddress: settings.restaurantAddress,
    orderNumber: opts.orderNumber,
    orderType: opts.orderType,
    customerName: opts.customerName,
    customerPhone: opts.customerPhone,
    deliveryAddress: opts.deliveryAddress,
    deliveryNote: opts.deliveryNote,
    courierName: opts.courierName,
    estimatedMinutes: opts.estimatedMinutes,
    items: opts.items,
    subtotal: opts.subtotal,
    total: opts.total,
    footer: settings.receiptFooter,
    printStyle: settings.printStyle,
  });

  // Mobil / web fast path — yazıcı çözümlemesi yok, kuyruğa.
  if (!isElectron()) {
    posDebugLog('[ŞefPOS] Paket fişi: mobil/web tarafından kuyruğa eklendi.');
    await printHtml(html, '', { title: 'Paket fişi gönderildi' });
    return;
  }

  const devices = await getAvailablePrinters();
  const takeawayPrinters = settings.printers.filter((p) => p.enabled && p.type === 'takeaway');
  let rawName =
    takeawayPrinters.length > 0
      ? takeawayPrinters[0].printerName
      : settings.defaultTakeawayPrinter || settings.defaultReceiptPrinter || '';
  const printerName = await resolveThermalDeviceName(rawName, devices);

  await printHtml(html, printerName, { title: 'Paket fişi gönderildi' });
}

export async function printKitchenReceipts(opts: {
  settings: PrintSettings;
  restaurantName: string;
  tableLabel: string;
  orderNumber: string;
  items: KitchenPrintItem[];
  note?: string;
  /** Siparişi alan garson; mutfak fişi başlığında yazılır. */
  waiterName?: string;
  /** Web: agent yoksa tarayıcı yazdırma (yalnızca online platform mutfak fişi). */
  allowWebBrowserPrint?: boolean;
}): Promise<void> {
  const { settings, items } = opts;
  const st = settings.printStyle || DEFAULT_PRINT_STYLE;

  if (items.length === 0) return;

  const disabled = new Set(settings.disabledCategoryIds || []);
  const filtered = items.filter((i) => {
    if (!i.categoryId) return true;
    return !disabled.has(i.categoryId);
  });
  if (filtered.length === 0) return;

  const { groups: logicalGroups, unresolved } = partitionKitchenItemsByLogicalPrinter(
    settings,
    filtered,
  );

  const printOneKitchenBatch = async (printerName: string, batchItems: KitchenPrintItem[]) => {
    if (batchItems.length === 0) return;
    const html = buildKitchenHtml({
      restaurantName: opts.restaurantName,
      tableLabel: opts.tableLabel,
      orderNumber: opts.orderNumber,
      items: batchItems,
      note: opts.note,
      waiterName: opts.waiterName,
      printStyle: st,
    });
    const label = printerName ? `printer="${printerName}"` : 'printer=(varsayılan)';
    posDebugLog(`[ŞefPOS] Mutfak fişi: ${batchItems.length} ürün → ${label}`);
    await printHtml(html, printerName, {
      title: 'Mutfak fişi gönderildi',
      allowBrowserFallback: opts.allowWebBrowserPrint === true,
    });
  };

  // Mobil / web: ayarlardaki mantıksal yazıcı adıyla **ayrı** print_jobs satırı.
  // Eskiden tek satır + boş printer_name tüm siparişi tek yazıcıya gönderiyordu.
  if (!isElectron()) {
    for (const logical of Object.keys(logicalGroups).sort()) {
      await printOneKitchenBatch(logical, logicalGroups[logical]);
    }
    if (unresolved.length > 0) {
      console.warn(
        `[ŞefPOS] Mutfak fişi: ${unresolved.length} ürün yazıcı eşlemesi yok, BASILMADI:`,
        unresolved.map((u) => u.productName).join(', '),
      );
    }
    return;
  }

  // Electron: önce mantıksal grupla, sonra OS yazıcı adına birleştir (aynı fiziksel
  // yazıcıya giden mantıksal isimler tek fişte birleşir).
  const devices = await getAvailablePrinters();
  const printerItemsMap: Record<string, KitchenPrintItem[]> = {};
  for (const [logical, batchItems] of Object.entries(logicalGroups)) {
    const osName = (await resolveThermalDeviceName(logical, devices)).trim() || logical;
    (printerItemsMap[osName] ||= []).push(...batchItems);
  }

  if (Object.keys(printerItemsMap).length === 0) {
    if (unresolved.length > 0) {
      console.warn(
        `[ŞefPOS] Mutfak fişi: ${unresolved.length} ürün yazıcı eşlemesi yok, BASILMADI:`,
        unresolved.map((u) => u.productName).join(', '),
      );
    }
    return;
  }

  for (const printerName of Object.keys(printerItemsMap).sort()) {
    const printerItems = printerItemsMap[printerName];
    if (!printerItems?.length) continue;
    await printOneKitchenBatch(printerName, printerItems);
  }

  if (unresolved.length > 0) {
    console.warn(
      `[ŞefPOS] Mutfak fişi: ${unresolved.length} ürün yazıcı eşlemesi yok, BASILMADI:`,
      unresolved.map((u) => u.productName).join(', '),
    );
  }
}

/**
 * Online sipariş (Getir / Yemeksepeti / vb.) mutfak fişi.
 * Verify / onay kullanıcıda kalsa da ürünler mutfağa düşer; Getir API çağrısı yapmaz.
 */
export async function printOnlineOrderKitchenTicket(opts: {
  settings: PrintSettings;
  restaurantName: string;
  platformLabel: string;
  orderNumber: string;
  customerName?: string;
  customerAddress?: string;
  verificationCode?: string | null;
  items: Array<{ platform_product_name: string; quantity: number; notes?: string | null }>;
  /** Verilirse kategori yönlendirmesi atlanır; tek yazıcıya basılır. */
  printerName?: string;
}): Promise<{ success: boolean; error?: string }> {
  const kitchenItems: KitchenPrintItem[] = (opts.items || []).map((it) => ({
    productName: (it.platform_product_name || 'Ürün').trim() || 'Ürün',
    quantity: Math.max(1, Math.floor(Number(it.quantity) || 1)),
    notes: it.notes || null,
  }));
  if (kitchenItems.length === 0) {
    kitchenItems.push({ productName: '(Ürün listesi boş — panelden kontrol edin)', quantity: 1 });
  }
  const noteParts = [
    `Platform: ${opts.platformLabel}`,
    opts.customerName ? `Müşteri: ${opts.customerName}` : '',
    opts.customerAddress ? `Adres: ${opts.customerAddress}` : '',
    opts.verificationCode ? `Doğrulama: ${String(opts.verificationCode).toUpperCase()}` : '',
  ].filter(Boolean);
  const forcedPrinter = (opts.printerName || getOnlinePlatformPrinterName(opts.settings)).trim();
  if (forcedPrinter) {
    const st = opts.settings.printStyle || DEFAULT_PRINT_STYLE;
    const html = buildKitchenHtml({
      restaurantName: opts.restaurantName,
      tableLabel: `ONLINE • ${opts.platformLabel}`,
      orderNumber: opts.orderNumber,
      items: kitchenItems,
      note: noteParts.join('\n'),
      printStyle: st,
    });
    let printer = forcedPrinter;
    if (isElectron()) {
      printer = await resolveTargetThermalPrinterName(printer);
    }
    return printHtml(html, printer, {
      title: 'Online sipariş fişi',
      silent: true,
      allowBrowserFallback: true,
    });
  }

  await printKitchenReceipts({
    settings: opts.settings,
    restaurantName: opts.restaurantName,
    tableLabel: `ONLINE • ${opts.platformLabel}`,
    orderNumber: opts.orderNumber,
    items: kitchenItems,
    note: noteParts.join('\n'),
    allowWebBrowserPrint: true,
  });
  return { success: true };
}

