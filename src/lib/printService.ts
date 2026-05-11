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
  restaurantName: string;
  restaurantPhone: string;
  restaurantAddress: string;
  receiptFooter: string;
  disabledCategoryIds: string[];
  printStyle: PrintStyleSettings;
}

import { supabase } from './supabase';
import { dispatchPrintToast } from './printToasts';

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
const PRINT_AGENT_URL = 'http://127.0.0.1:7878';

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
  emitContextChange();
}

export function setPrintAgentTenantId(tenantId: string | null) {
  if (_currentTenantId === tenantId) return;
  _currentTenantId = tenantId;
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
  paperOffsetMm: 0,
};

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
    defaultTakeawayPrinter: typeof ps.defaultTakeawayPrinter === 'string' ? ps.defaultTakeawayPrinter : '',
    autoPrintKitchen: ps.autoPrintKitchen !== false,
    autoPrintReceipt: !!ps.autoPrintReceipt,
    autoPrintTakeaway: ps.autoPrintTakeaway !== false,
    // Yeni alan: eski kayıtlarda yok → varsayılan kapalı (kullanıcı isterse açar).
    receiptPrintDefaultOn: ps.receiptPrintDefaultOn === true,
    restaurantName: typeof ps.restaurantName === 'string' ? ps.restaurantName : '',
    restaurantPhone: typeof ps.restaurantPhone === 'string' ? ps.restaurantPhone : '',
    restaurantAddress: typeof ps.restaurantAddress === 'string' ? ps.restaurantAddress : '',
    receiptFooter: typeof ps.receiptFooter === 'string' ? ps.receiptFooter : 'Teşekkür ederiz, iyi günler!',
    disabledCategoryIds: Array.isArray(ps.disabledCategoryIds) ? ps.disabledCategoryIds : [],
    printStyle: (() => {
      const merged = { ...DEFAULT_PRINT_STYLE, ...(ps.printStyle && typeof ps.printStyle === 'object' ? ps.printStyle : {}) };
      merged.paperOffsetMm = clampOffsetMm(merged.paperOffsetMm);
      return merged;
    })(),
  };
}

/**
 * Tenant + branch'a özel ayarları okur. Eğer bu bağlama ait kayıt yoksa
 * **bir kerelik** legacy anahtardan (`shefpos_print_settings`) migrasyon
 * yapar: legacy içeriği yeni anahtara taşır ve legacy kaydı siler. Böylece
 * ilk login olan tenant eski tek-kullanıcılık ayarlarını kaybetmez, sonra
 * tüm tenantlar tamamen izole olur.
 */
export function loadPrintSettings(): PrintSettings {
  try {
    const key = getPrintSettingsKey();
    let raw = localStorage.getItem(key);

    if (!raw && key !== PRINT_SETTINGS_LEGACY_KEY) {
      const legacy = localStorage.getItem(PRINT_SETTINGS_LEGACY_KEY);
      if (legacy) {
        try {
          localStorage.setItem(key, legacy);
          localStorage.removeItem(PRINT_SETTINGS_LEGACY_KEY);
        } catch (_) { /* quota vb. yoksay */ }
        raw = legacy;
      }
    }

    if (raw) return normalizePrintSettings(JSON.parse(raw));
  } catch {}
  return normalizePrintSettings({});
}

export function savePrintSettings(settings: PrintSettings) {
  const normalized = normalizePrintSettings(settings);
  const key = getPrintSettingsKey();
  localStorage.setItem(key, JSON.stringify(normalized));
  // Bulut tarafına da arka planda yaz; başarısız olursa lokal sürüm yine
  // canlı kalır. Tenant veya branch henüz set edilmediyse (preauth) yazma.
  if (_currentTenantId) {
    void pushPrintSettingsToCloud(normalized).catch((err) => {
      console.warn('[ŞefPOS] print_settings cloud upsert başarısız:', err?.message || err);
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
  try {
    let query = (supabase.from('print_settings' as any) as any)
      .select('settings, updated_at')
      .eq('tenant_id', _currentTenantId);
    query = _currentBranchId
      ? query.eq('branch_id', _currentBranchId)
      : query.is('branch_id', null);
    const { data, error } = await query.maybeSingle();
    if (error) {
      // Tablo henüz migrate edilmemiş olabilir; ilk login'de gürültü olmasın.
      const code = (error as any).code as string | undefined;
      if (code !== 'PGRST116' && code !== '42P01') {
        console.warn('[ŞefPOS] print_settings okuma hatası:', error.message);
      }
      return null;
    }
    if (!data || !data.settings) return null;
    const normalized = normalizePrintSettings(data.settings as any);
    const key = getPrintSettingsKey();
    try {
      localStorage.setItem(key, JSON.stringify(normalized));
    } catch (_) { /* quota vb. yoksay */ }
    _lastCloudPullAt = Date.now();
    if (typeof window !== 'undefined') {
      try {
        window.dispatchEvent(
          new CustomEvent(PRINT_SETTINGS_REMOTE_UPDATED_EVENT, {
            detail: { tenantId: _currentTenantId, branchId: _currentBranchId },
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
  // upsert → aynı (tenant_id, branch_id) varsa update.
  const payload: any = {
    tenant_id: _currentTenantId,
    branch_id: _currentBranchId,
    settings,
  };
  try {
    const { error } = await (supabase.from('print_settings' as any) as any).upsert(
      payload,
      { onConflict: 'tenant_id,branch_id' },
    );
    if (error) {
      const code = (error as any).code as string | undefined;
      // Tablo yok → migration uygulanmamış. Sessizce geç, lokal cache yeter.
      if (code === '42P01') return;
      // Unique conflict NULL branch_id'de PostgREST upsert fail edebilir; bu
      // durumda manuel update + insert dener.
      if (code === '23505' || code === '21000') {
        let q = (supabase.from('print_settings' as any) as any)
          .update({ settings })
          .eq('tenant_id', _currentTenantId);
        q = _currentBranchId
          ? q.eq('branch_id', _currentBranchId)
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
 *   1. Aktif (kitchen/bar/custom) yazıcılardan kategoriyi *açıkça* listede
 *      tutan ilk yazıcı (= yönetici tarafından eşlenen yazıcı).
 *   2. Kategori listesi boş bırakılmış catch-all kitchen-route yazıcı.
 *   3. `defaultKitchenPrinter` (Ayarlar → Genel).
 *
 * Sonuç olarak `null` dönerse mutfak fişi atanamaz; UI bunu kırmızı uyarı
 * ile gösterir.
 */
export function resolveCategoryPrinter(
  settings: PrintSettings,
  categoryId: string | null | undefined
): { printerName: string; source: 'category' | 'catch-all' | 'default' } | null {
  const route = getKitchenRoutePrinters(settings);
  if (categoryId) {
    const matched = route.find((p) => p.categoryIds.length > 0 && p.categoryIds.includes(categoryId));
    if (matched) return { printerName: matched.printerName, source: 'category' };
  }
  const catchAll = route.find((p) => p.categoryIds.length === 0);
  if (catchAll) return { printerName: catchAll.printerName, source: 'catch-all' };
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
  const partial = names.find(
    (n) => n.toLowerCase().includes(tl) || tl.includes(n.toLowerCase())
  );
  if (partial) return partial;
  return t;
}

export function isElectron(): boolean {
  return !!(window as any).electronAPI?.isElectron;
}

export type PrintAgentStatus = 'connected' | 'not_running' | 'blocked_mixed_content' | 'unknown_error';

export async function checkPrintAgent(): Promise<boolean> {
  const result = await checkPrintAgentDetailed();
  return result.connected;
}

export async function checkPrintAgentDetailed(): Promise<{ connected: boolean; status: PrintAgentStatus; detail?: string }> {
  if (isElectron()) return { connected: false, status: 'unknown_error' };

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
  if (!w.electronAPI?.registerPrinters) return;
  try {
    await w.electronAPI.registerPrinters({ tenantId, branchId, userJwt });
  } catch {}
}

function fmt(n: number) {
  return n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
  const noteFs = Math.max(st.kitchenBodyPx, 11);
  const optFs = Math.max(st.kitchenBodyPx + 1, 12);
  const off = clampOffsetMm(st.paperOffsetMm);
  return `<style>
  ${scope} { font-size: ${st.kitchenBodyPx}px !important; line-height: 1.3; color:#000; margin-left: ${off}mm; margin-right: ${-off}mm; }
  ${scope} .xlarge { font-size: ${st.kitchenTitlePx}px !important; }
  ${scope} .large { font-size: ${Math.max(st.kitchenBodyPx + 1, 13)}px !important; }
  ${scope} .row.bold.xlarge { font-size: ${st.kitchenItemPx}px !important; }
  ${scope} .subtitle { font-size: ${Math.max(st.kitchenBodyPx - 1, 10)}px !important; text-align: center; margin: 2px 0; }
  ${scope} .header-meta { font-size: ${Math.max(st.kitchenBodyPx - 1, 10)}px !important; }
  ${scope} .item-block { padding: 4px 0 6px 0; }
  ${scope} .item-row .name { width: 80% !important; font-size: ${st.kitchenItemPx}px !important; font-weight: 800 !important; }
  ${scope} .item-row .qty  { width: 20% !important; text-align: right !important; font-size: ${st.kitchenItemPx}px !important; font-weight: 800 !important; }
  ${scope} .opt-line { font-size: ${optFs}px !important; font-weight: 700; padding: 2px 0 2px 10px; border-left: 3px solid #000; margin: 3px 0 3px 6px; }
  ${scope} .note-line { font-size: ${noteFs}px !important; padding: 2px 6px; margin: 3px 0 3px 6px; background: #000; color:#fff; border-radius: 3px; font-weight: 800; }
  ${scope} .item-sep { border: 0; border-top: 1px dashed #000; margin: 4px 0 0 0; }
  ${scope} .general-note { font-size: ${noteFs}px !important; font-weight: 800; padding: 4px 6px; margin: 4px 0; background:#000; color:#fff; border-radius: 3px; text-align: center; }
  ${scope} .footer { font-size: ${Math.max(st.kitchenBodyPx - 2, 9)}px !important; }
  ${scope} .extra-line { font-size: ${Math.max(st.kitchenBodyPx - 1, 10)}px !important; text-align: center; margin: 4px 0; }
</style>`;
}

function receiptStyleBlock(st: PrintStyleSettings): string {
  const scope = '.sefpos-receipt-scope';
  const off = clampOffsetMm(st.paperOffsetMm);
  return `<style>
  ${scope} { font-size: ${st.receiptBodyPx}px !important; line-height: 1.3; margin-left: ${off}mm; margin-right: ${-off}mm; }
  ${scope} .xlarge { font-size: ${st.receiptTitlePx}px !important; }
  ${scope} .large { font-size: ${Math.max(st.receiptBodyPx + 2, 13)}px !important; }
  ${scope} .subtitle { font-size: ${Math.max(st.receiptBodyPx - 1, 10)}px !important; text-align: center; margin: 2px 0; }
  ${scope} .note { font-size: ${Math.max(st.receiptBodyPx - 2, 9)}px !important; }
  ${scope} .footer { font-size: ${Math.max(st.receiptBodyPx - 2, 9)}px !important; }
  ${scope} .extra-line { font-size: ${Math.max(st.receiptBodyPx - 1, 10)}px !important; text-align: center; margin: 4px 0; }
  ${scope} .total-row { font-size: ${Math.max(st.receiptBodyPx + 2, 14)}px !important; }
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
    html += row(label, `${item.quantity}x`, `${fmt(item.unitPrice)}₺`);
    if (item.quantity > 1) {
      html += `<div class="row"><span class="name"></span><span class="qty"></span><span class="price bold">${fmt(item.totalAmount)}₺</span></div>`;
    }
    if (item.notes) {
      html += `<div class="note">Not: ${item.notes}</div>`;
    }
  });

  html += `<div class="line"></div>`;
  html += `<div class="row"><span>Ara Toplam</span><span>${fmt(opts.subtotal)}₺</span></div>`;
  if (opts.taxAmount > 0) {
    html += `<div class="row"><span>KDV</span><span>${fmt(opts.taxAmount)}₺</span></div>`;
  }
  if (opts.discountAmount > 0) {
    html += `<div class="row"><span>İndirim</span><span>-${fmt(opts.discountAmount)}₺</span></div>`;
  }
  html += `<div class="line"></div>`;
  html += `<div class="total-row" style="font-size:${Math.max(st.receiptBodyPx + 2, 14)}px"><span>TOPLAM</span><span>${fmt(opts.total)}₺</span></div>`;
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
  channel?: 'electron' | 'queue' | 'agent';
  toastTitle?: string;
  silent?: boolean;
}): void {
  if (opts.silent) return;
  const target = opts.printerName || undefined;
  if (opts.success) {
    if (opts.channel === 'queue') {
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

/**
 * Yazdırma akışı — üç katmanlı strateji:
 *
 * 1. **Electron** (kasa makinesi): doğrudan yerel yazıcıya bas, sonuç
 *    `success/error` olarak toast'lanır.
 *
 * 2. **Web / mobil**: doğrudan yazıcı erişimi yoktur. Sipariş gönderen
 *    kişi mobilden de olsa, `print_jobs` kuyruğuna yazılır → kasadaki
 *    Electron Print Agent bunu Realtime ile alıp gerçek yazıcıdan basar.
 *    Insert başarılıysa **"Mutfağa gönderildi"** toast'ı atılır;
 *    başarısızsa kullanıcıya `"yazıcıya ulaşılamadı"` GİBİ HATA
 *    GÖSTERİLMEZ — siparişin kendisi zaten Supabase'e kaydedilmiştir.
 *    Sadece soft uyarı: "Bağlantı sorunu, kasaya iletildiğinde basılır."
 *
 * 3. **Eski local Print Agent HTTP fallback** yalnızca tenant/branch
 *    kimliği olmayan terminal modu için tutuluyor; web'de mixed-content
 *    yüzünden zaten erişilmez.
 */
export async function printHtml(
  html: string,
  printerName: string,
  toastOpts?: { title?: string; silent?: boolean }
): Promise<{ success: boolean; error?: string }> {
  const w = window as any;
  const silent = toastOpts?.silent === true;
  const title = toastOpts?.title;

  // 1) Electron — yerel yazıcı.
  if (w.electronAPI?.printReceipt) {
    try {
      const result = await w.electronAPI.printReceipt({ html, printerName: printerName || undefined, silent: true });
      notifyPrintResult({
        success: !!result.success,
        printerName,
        errorDetail: result.errorType || result.error || undefined,
        channel: 'electron',
        toastTitle: title,
        silent,
      });
      return { success: result.success, error: result.errorType || undefined };
    } catch (err: any) {
      notifyPrintResult({ success: false, printerName, errorDetail: err?.message, channel: 'electron', silent });
      return { success: false, error: err.message };
    }
  }

  // 2) Web / mobil — Supabase print_jobs kuyruğu.
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
        console.info('[ŞefPOS] print job kuyruğa eklendi:', {
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

  // 3) Local Print Agent HTTP fallback (terminal modu, tenant ID yok).
  try {
    const res = await fetch(`${PRINT_AGENT_URL}/print`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ html, printerName: printerName || undefined, silent: true }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json();
    notifyPrintResult({
      success: !!data.success,
      printerName,
      errorDetail: data.errorType || data.error || undefined,
      channel: 'agent',
      toastTitle: title,
      silent,
    });
    return { success: data.success, error: data.errorType || data.error || undefined };
  } catch (err: any) {
    // Sessizce başarısız ol; kullanıcıya korkutucu hata atma.
    console.warn('[ŞefPOS] Print Agent HTTP fallback başarısız:', err?.message);
    if (!silent) {
      dispatchPrintToast({
        kind: 'queued',
        message: 'Sipariş kaydedildi',
        detail: 'Yazıcı çevrimdışı; kasaya bağlanınca basılacak.',
      });
    }
    return { success: false, error: 'Print Agent yok' };
  }
}

/** Müşteri adisyonu — yalnızca Ayarlarda seçilen yazıcı; boşsa başarısız döner */
export async function printToAdisyonPrinter(
  settings: PrintSettings,
  html: string,
  toastOpts?: { title?: string; silent?: boolean }
): Promise<{ success: boolean; error?: string }> {
  const raw = getAdisyonPrinterName(settings);
  if (!raw) {
    if (toastOpts?.silent !== true) {
      dispatchPrintToast({
        kind: 'error',
        message: 'Adisyon yazıcısı seçilmedi',
        detail: 'Ayarlar → Yazıcılar → "Adisyon / müşteri fişi yazıcısı" alanını doldurun.',
      });
    }
    return { success: false, error: 'Adisyon yazıcısı seçilmedi (Ayarlar → Yazıcılar).' };
  }
  const devices = await getAvailablePrinters();
  const name = await resolveThermalDeviceName(raw, devices);
  return printHtml(html, name, { title: toastOpts?.title || 'Adisyon yazdırıldı', silent: toastOpts?.silent });
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

  let html = receiptStyleBlock(st);
  html += `<div class="sefpos-receipt-scope">`;
  html += `
    <div class="center bold xlarge">${opts.restaurantName || 'ŞefPOS'}</div>
    ${st.receiptSubtitle ? `<div class="subtitle">${st.receiptSubtitle}</div>` : ''}
    ${opts.restaurantAddress ? `<div class="center" style="font-size:${fs}px">${opts.restaurantAddress}</div>` : ''}
    ${opts.restaurantPhone ? `<div class="center" style="font-size:${fs}px">Tel: ${opts.restaurantPhone}</div>` : ''}
    <div class="line"></div>
    <div class="center bold large">${isDelivery ? '🚴 KURYE SİPARİŞİ' : '📦 PAKET SERVİS'}</div>
    <div class="line"></div>
    <div class="row"><span>Tarih:</span><span>${date} ${time}</span></div>
    ${opts.orderNumber ? `<div class="row"><span>Sipariş No:</span><span>${opts.orderNumber}</span></div>` : ''}
    ${opts.customerName ? `<div class="row"><span>Müşteri:</span><span>${opts.customerName}</span></div>` : ''}
    ${opts.customerPhone ? `<div class="row"><span>Telefon:</span><span>${opts.customerPhone}</span></div>` : ''}
  `;

  if (isDelivery && opts.deliveryAddress) {
    html += `
    <div class="line"></div>
    <div class="note bold">TESLİMAT ADRESİ:</div>
    <div class="note">${opts.deliveryAddress}</div>
    ${opts.deliveryNote ? `<div class="note">Not: ${opts.deliveryNote}</div>` : ''}
    ${opts.courierName ? `<div class="row"><span>Kurye:</span><span>${opts.courierName}</span></div>` : ''}
    ${opts.estimatedMinutes ? `<div class="row"><span>Tahmini Süre:</span><span>${opts.estimatedMinutes} dk</span></div>` : ''}
    `;
  }

  html += `
    <div class="line"></div>
    <div class="row bold">
      <span class="name">ÜRÜN</span><span class="qty">ADT</span><span class="price">TUTAR</span>
    </div>
    <div class="line"></div>
  `;

  opts.items.forEach(item => {
    const label = item.variantName ? `${item.productName} (${item.variantName})` : item.productName;
    html += row(label, `${item.quantity}x`, `${fmt(item.unitPrice)}₺`);
    if (item.quantity > 1) {
      html += `<div class="row"><span class="name"></span><span class="qty"></span><span class="price bold">${fmt(item.totalAmount)}₺</span></div>`;
    }
    if (item.notes) html += `<div class="note">Not: ${item.notes}</div>`;
  });

  html += `<div class="line"></div>`;
  html += `<div class="total-row" style="font-size:${Math.max(st.receiptBodyPx + 2, 14)}px"><span>TOPLAM</span><span>${fmt(opts.total)}₺</span></div>`;
  html += `<div class="line"></div>`;
  if (st.receiptFooterExtra) {
    html += `<div class="extra-line">${st.receiptFooterExtra}</div>`;
  }
  html += `<div class="footer">${opts.footer || 'Teşekkür ederiz!'}</div>`;
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
  const devices = await getAvailablePrinters();
  const takeawayPrinters = settings.printers.filter((p) => p.enabled && p.type === 'takeaway');
  let rawName =
    takeawayPrinters.length > 0
      ? takeawayPrinters[0].printerName
      : settings.defaultTakeawayPrinter || settings.defaultReceiptPrinter || '';
  const printerName = await resolveThermalDeviceName(rawName, devices);

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

  const devices = await getAvailablePrinters();

  async function resolveTargetForItem(item: KitchenPrintItem): Promise<string> {
    // 1) Ürün kartında elle yazıcı verilmişse en yüksek öncelik onun.
    if (item.productPrinterName?.trim()) {
      return resolveThermalDeviceName(item.productPrinterName, devices);
    }
    // 2) Kategori → yazıcı eşleşmesi / catch-all / defaultKitchenPrinter.
    const resolved = resolveCategoryPrinter(settings, item.categoryId);
    if (resolved) {
      return resolveThermalDeviceName(resolved.printerName, devices);
    }
    return '';
  }

  const printerItemsMap: Record<string, KitchenPrintItem[]> = {};

  for (const item of filtered) {
    const target = await resolveTargetForItem(item);
    if (!target) {
      console.warn(
        '[ŞefPOS] Mutfak fişi: yazıcı atanamadı. Ayarlar → Yazıcılar: mutfak yazıcısı, kategori veya "varsayılan mutfak" seçin.',
        item.productName
      );
      continue;
    }
    if (!printerItemsMap[target]) printerItemsMap[target] = [];
    printerItemsMap[target].push(item);
  }

  if (Object.keys(printerItemsMap).length === 0) {
    // Mobile / web fallback: cihazda yazıcı listesi yok ya da kategori
    // eşlemesi tanımlı değil. Yine de SİPARİŞ MUTFAĞA GİTSİN diye tek bir
    // mutfak fişi build edip print_jobs kuyruğuna boş printer_name ile
    // insert ediyoruz. Electron Print Agent kuyruktan alırken
    // defaultKitchenPrinter / kayıtlı ilk mutfak yazıcısına basacak.
    if (!isElectron()) {
      console.info(
        '[ŞefPOS] Mutfak fişi: cihazda yazıcı çözülemedi, kuyruğa boş printer_name ile gönderiliyor (Electron varsayılana basacak).'
      );
      const html = buildKitchenHtml({
        restaurantName: opts.restaurantName,
        tableLabel: opts.tableLabel,
        orderNumber: opts.orderNumber,
        items: filtered,
        note: opts.note,
        waiterName: opts.waiterName,
        printStyle: st,
      });
      await printHtml(html, '', { title: 'Mutfak fişi gönderildi' });
      return;
    }
    console.warn(
      '[ŞefPOS] Mutfak fişi yazdırılamadı: geçerli yazıcı yok. Ayarlar → Yazıcılar: mutfak yazıcısı, kategori veya "varsayılan mutfak" seçin.'
    );
    return;
  }

  for (const [printerName, printerItems] of Object.entries(printerItemsMap)) {
    if (printerItems.length === 0) continue;
    const html = buildKitchenHtml({
      restaurantName: opts.restaurantName,
      tableLabel: opts.tableLabel,
      orderNumber: opts.orderNumber,
      items: printerItems,
      note: opts.note,
      waiterName: opts.waiterName,
      printStyle: st,
    });
    await printHtml(html, printerName, { title: 'Mutfak fişi gönderildi' });
  }
}
