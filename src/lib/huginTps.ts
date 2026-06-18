/** Hugin yazarkasa — TPS (HTTP/3001) ve PC Link S1 (HTTPS/4443). Bkz. developer.hugin.com.tr */

import { dispatchPrintToast } from './printToasts';

export type HuginApiMode = 'pc_link' | 'tps';

export interface HuginSettings {
  enabled: boolean;
  apiMode: HuginApiMode;
  deviceIp: string;
  devicePort: number;
  /** TPS: OKC kimliği */
  okcId: string;
  /** TPS: cihaz şifresi */
  password: string;
  /** PC Link: entegrasyon VKN (X-SoftwareId) */
  softwareId: string;
  /** PC Link: PC MAC (X-HardwareId) */
  hardwareId: string;
  /** PC Link: mali sicil (X-SerialNo) — test sonrası otomatik doldurulabilir */
  serialNo: string;
  vatRate: number;
  departmentId: number;
}

export interface HuginSaleItem {
  productName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  /** Ürün / satır KDV oranı (%). Kategori grubu değil. */
  productVatRate?: number | null;
  categoryDepartmentId?: number | null;
}

export interface HuginPaymentSplit {
  method: 'cash' | 'credit_card';
  amount: number;
}

export interface HuginSaleRequest {
  orderNumber: number;
  /** @deprecated Mali fişte kullanılmıyor */
  tableLabel?: string;
  items: HuginSaleItem[];
  totalAmount: number;
  discountAmount: number;
  payments: HuginPaymentSplit[];
}

export interface HuginHttpResult {
  ok: boolean;
  status: number;
  body: string;
  headers?: Record<string, string>;
  error?: string;
}

export type HuginFailureKind =
  | 'card_declined'
  | 'cancelled'
  | 'timeout'
  | 'device_busy'
  | 'generic';

export interface HuginSaleResult {
  success: boolean;
  error?: string;
  skipped?: boolean;
  documentId?: string;
  failureKind?: HuginFailureKind;
}

const SETTINGS_KEY = 'hugin_tps_settings';

const DEFAULTS: HuginSettings = {
  enabled: false,
  apiMode: 'pc_link',
  deviceIp: '192.168.1.100',
  devicePort: 4443,
  okcId: '',
  password: '',
  softwareId: '',
  hardwareId: '',
  serialNo: '',
  vatRate: 10,
  departmentId: 1,
};

function normalizeSettings(raw: Partial<HuginSettings> | null | undefined): HuginSettings {
  const base = { ...DEFAULTS, ...(raw || {}) };
  if (!raw?.apiMode) {
    // Eski kayıtlar: OKC doluysa TPS, değilse S1 için PC Link
    base.apiMode = raw?.okcId ? 'tps' : 'pc_link';
  }
  if (base.apiMode === 'pc_link' && (!raw?.devicePort || raw.devicePort === 3001)) {
    base.devicePort = 4443;
  }
  if (base.apiMode === 'tps' && raw?.devicePort === 4443 && !raw?.okcId) {
    base.devicePort = 3001;
  }
  return base;
}

/** Aktif ve masaüstünde yapılandırılmış mı (satış gönderilebilir). */
/** Tam ödeme sonrası mali fiş gönderilmeli mi? */
export function shouldSendHuginForPayments(
  payments: Array<{ payment_method?: string | null; amount?: number | null }>,
): boolean {
  if (!loadHuginSettings().enabled) return false;
  if (!isHuginSaleReady()) return false;
  return paymentsForHugin(payments).length > 0;
}

export function isHuginSaleReady(): boolean {
  const settings = normalizeSettings(loadHuginSettings());
  if (!settings.enabled) return false;
  if (!huginRequiresDesktop()) return false;
  return validateSettings(settings) === null;
}

export function paymentsForHugin(
  payments: Array<{ payment_method?: string | null; amount?: number | null }>,
): HuginPaymentSplit[] {
  return payments
    .map((p) => {
      const raw = String(p.payment_method || '').toLowerCase();
      const method: 'cash' | 'credit_card' | null =
        raw === 'cash' ? 'cash' : raw === 'credit_card' || raw === 'card' ? 'credit_card' : null;
      if (!method) return null;
      const amount = Number(p.amount) || 0;
      if (amount <= 0) return null;
      return { method, amount };
    })
    .filter((x): x is HuginPaymentSplit => x !== null);
}

/** Sipariş paneli satırlarından Hugin kalemleri (iptal hariç). */
export function buildHuginItemsFromOrderLines(
  rows: Array<Record<string, unknown>>,
  fallbackCategories?: Map<string, { vat_rate?: number | null; hugin_department_id?: number | null }>,
): HuginSaleItem[] {
  const out: HuginSaleItem[] = [];
  for (const row of rows) {
    if (row.cancelled_at) continue;
    const qty = Number(row.quantity) || 0;
    if (qty <= 0) continue;
    const unitPrice = Number(row.unit_price) || 0;
    let totalPrice = Number(row.total_amount) || 0;
    if (totalPrice <= 0 && unitPrice > 0) totalPrice = unitPrice * qty;
    if (totalPrice <= 0) continue;

    const products = row.products as
      | { name?: string; category_id?: string; tax_rate?: number | null; categories?: { vat_rate?: number | null; hugin_department_id?: number | null } }
      | undefined;
    const catFromProduct = products?.categories;
    const catId = products?.category_id as string | undefined;
    const catFallback = catId && fallbackCategories ? fallbackCategories.get(catId) : undefined;

    const lineTax = row.tax_rate != null ? Number(row.tax_rate) : NaN;
    const productTax = products?.tax_rate != null ? Number(products.tax_rate) : NaN;
    const productVatRate =
      Number.isFinite(lineTax) && lineTax >= 0
        ? lineTax
        : Number.isFinite(productTax) && productTax >= 0
          ? productTax
          : null;

    const name =
      (products?.name && String(products.name)) ||
      (row.product_name && String(row.product_name)) ||
      'Ürün';

    out.push({
      productName: name,
      quantity: qty,
      unitPrice: unitPrice > 0 ? unitPrice : totalPrice / qty,
      totalPrice,
      productVatRate,
      categoryDepartmentId:
        catFromProduct?.hugin_department_id ?? catFallback?.hugin_department_id ?? null,
    });
  }
  return out;
}

export function loadHuginSettings(): HuginSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return normalizeSettings(JSON.parse(raw));
  } catch {
    /* yoksay */
  }
  return { ...DEFAULTS };
}

export function saveHuginSettings(settings: HuginSettings): void {
  const normalized = normalizeSettings(settings);
  const toSave =
    normalized.apiMode === 'pc_link' ? normalizePcLinkSettings(normalized) : normalized;
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(toSave));
}

export function huginRequiresDesktop(): boolean {
  return typeof window !== 'undefined' && !!(window as any).electronAPI?.isElectron;
}

function formatMoney(amount: number): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '0.00';
  return n.toFixed(2);
}

/** Hugin örneklerinde tutar çoğu zaman "190" gibi (kuruş yoksa ondalıksız). */
function formatHuginAmount(amount: number): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '0';
  const fixed = n.toFixed(2);
  if (fixed.endsWith('.00')) return String(Math.round(n));
  return fixed;
}

function normalizeMacAddress(mac: string): string {
  const raw = String(mac || '').trim().toUpperCase();
  if (!raw) return '';
  const hex = raw.replace(/[^0-9A-F]/g, '');
  if (hex.length === 12) {
    return hex.match(/.{1,2}/g)!.join(':');
  }
  return raw;
}

function normalizeVkn(vkn: string): string {
  return String(vkn || '').replace(/\D/g, '');
}

function isHuginErrorStatus(status: string): boolean {
  const s = status.toUpperCase();
  return (
    s === 'ERROR' ||
    s === 'FAIL' ||
    s === 'FAILED' ||
    s === 'FAILURE' ||
    s.startsWith('ERR')
  );
}

function extractApiMessage(json: Record<string, unknown> | null): string {
  if (!json) return '';
  const out: string[] = [];
  const push = (v: unknown) => {
    if (typeof v === 'string' && v.trim()) out.push(v.trim());
    if (typeof v === 'number' && Number.isFinite(v)) out.push(String(v));
  };
  push(json.message);
  push(json.error);
  push(json.reason);
  push(json.code);
  const data = json.data;
  if (typeof data === 'string') push(data);
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>;
    push(d.message);
    push(d.error);
    push(d.errorMessage);
    push(d.description);
    push(d.reason);
    push(d.errorCode);
    push(d.code);
  }
  if (Array.isArray(json.errors)) {
    for (const e of json.errors) {
      if (typeof e === 'string') push(e);
      else if (e && typeof e === 'object') push((e as Record<string, unknown>).message);
    }
  }
  return out[0] || '';
}

function huginResponseHint(json: Record<string, unknown> | null, rawBody: string): string {
  const msg = extractApiMessage(json);
  if (msg) return msg;
  const trimmed = String(rawBody || '').trim();
  if (trimmed) return trimmed.slice(0, 200);
  return '';
}

function deviceBaseUrl(settings: HuginSettings): string {
  const ip = settings.deviceIp.trim();
  const port = settings.devicePort || (settings.apiMode === 'pc_link' ? 4443 : 3001);
  if (settings.apiMode === 'pc_link') {
    return `https://${ip}:${port}`;
  }
  return `http://${ip}:${port}`;
}

function desktopRequiredError(): { success: false; error: string } {
  return {
    success: false,
    error:
      'Hugin yazarkasa yalnızca ŞefPOS masaüstü (Electron) uygulamasından kullanılabilir. Tarayıcıdan doğrudan cihaza bağlanılamaz.',
  };
}

/** Electron ana süreç üzerinden HTTP(S); self-signed ÖKC sertifikası kabul edilir. */
export async function huginHttpRequest(opts: {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
}): Promise<HuginHttpResult> {
  const api = (window as any).electronAPI;
  if (api?.huginRequest) {
    return api.huginRequest(opts);
  }

  if (!huginRequiresDesktop()) {
    return { ok: false, status: 0, body: '', error: desktopRequiredError().error };
  }

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    };
    const init: RequestInit = {
      method: opts.method,
      headers,
      signal: AbortSignal.timeout(opts.timeoutMs ?? 10000),
    };
    if (opts.body !== undefined && opts.method !== 'GET' && opts.method !== 'HEAD') {
      init.body = typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body);
    }
    const response = await fetch(opts.url, init);
    const body = await response.text().catch(() => '');
    const hdrs: Record<string, string> = {};
    response.headers.forEach((v, k) => {
      hdrs[k.toLowerCase()] = v;
    });
    return { ok: response.ok, status: response.status, body, headers: hdrs };
  } catch (err: any) {
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
      return { ok: false, status: 0, body: '', error: 'Zaman aşımı — IP ve cihazda PC Link açık mı kontrol edin.' };
    }
    return { ok: false, status: 0, body: '', error: err?.message || 'Bağlantı hatası' };
  }
}

function parseJsonSafe(text: string): Record<string, unknown> | null {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function pcLinkHeaders(settings: HuginSettings, includeSerial = true): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  const sw = normalizeVkn(settings.softwareId);
  const hw = normalizeMacAddress(settings.hardwareId);
  if (sw) headers['X-SoftwareId'] = sw;
  if (hw) headers['X-HardwareId'] = hw;
  if (includeSerial && settings.serialNo.trim()) {
    headers['X-SerialNo'] = settings.serialNo.trim();
  }
  return headers;
}

function normalizePcLinkSettings(settings: HuginSettings): HuginSettings {
  return {
    ...settings,
    softwareId: normalizeVkn(settings.softwareId),
    hardwareId: normalizeMacAddress(settings.hardwareId),
    serialNo: settings.serialNo.trim(),
  };
}

function extractDocumentId(
  json: Record<string, unknown> | null,
  rawBody = '',
  headers?: Record<string, string>,
): string | null {
  const fromLoc = documentIdFromLocation(headers);
  if (fromLoc) return fromLoc;

  if (json) {
    if (typeof json.data === 'string' && json.data.trim()) {
      const s = json.data.trim();
      if (looksLikeDocumentId(s)) return s;
    }
    const data = json.data;
    if (data && typeof data === 'object') {
      const d = data as Record<string, unknown>;
      for (const key of Object.keys(d)) {
        if (!/id|document/i.test(key)) continue;
        const v = d[key];
        if (typeof v === 'string' && v.trim() && looksLikeDocumentId(v.trim())) return v.trim();
        if (typeof v === 'number' && Number.isFinite(v)) return String(v);
      }
    }
    for (const key of Object.keys(json)) {
      if (!/id|document/i.test(key)) continue;
      const v = json[key];
      if (typeof v === 'string' && v.trim() && looksLikeDocumentId(v.trim())) return v.trim();
      if (typeof v === 'number' && Number.isFinite(v)) return String(v);
    }
    const deep = findDocumentIdDeep(json);
    if (deep) return deep;
  }

  const trimmed = String(rawBody || '').trim();
  if (trimmed && !trimmed.startsWith('{') && looksLikeDocumentId(trimmed)) return trimmed;
  const uuidMatch = trimmed.match(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
  );
  if (uuidMatch) return uuidMatch[0];

  return null;
}

function looksLikeDocumentId(value: string): boolean {
  const s = value.trim();
  if (!s || s.length > 80) return false;
  if (/^[0-9a-f-]{36}$/i.test(s)) return true;
  if (/^[A-Z]{2}\d{5,}$/i.test(s)) return true;
  if (/^\d{4,}$/.test(s)) return true;
  return /^[A-Za-z0-9_-]{6,}$/.test(s);
}

function documentIdFromLocation(headers?: Record<string, string>): string | null {
  if (!headers) return null;
  const loc = headers.location || headers.Location;
  if (!loc) return null;
  const m = String(loc).match(/\/documents\/([^/?#]+)/i);
  return m?.[1] ? decodeURIComponent(m[1]) : null;
}

function findDocumentIdDeep(obj: unknown, depth = 0): string | null {
  if (depth > 8 || obj == null) return null;
  if (typeof obj === 'string') {
    const s = obj.trim();
    return looksLikeDocumentId(s) ? s : null;
  }
  if (typeof obj === 'number' && Number.isFinite(obj)) return String(obj);
  if (typeof obj !== 'object') return null;
  const rec = obj as Record<string, unknown>;
  for (const [key, val] of Object.entries(rec)) {
    if (/document.*id|^id$/i.test(key)) {
      if (typeof val === 'string' && val.trim() && looksLikeDocumentId(val.trim())) return val.trim();
      if (typeof val === 'number' && Number.isFinite(val)) return String(val);
    }
  }
  for (const val of Object.values(rec)) {
    const found = findDocumentIdDeep(val, depth + 1);
    if (found) return found;
  }
  return null;
}

function huginApiErrorMessage(json: Record<string, unknown> | null, fallback: string): string {
  const msg = extractApiMessage(json);
  if (msg) return msg;
  if (!json) return fallback;
  const status = String(json.status || '').toUpperCase();
  if (status && isHuginErrorStatus(status)) return fallback;
  return fallback;
}

/** Cihazdan güncel mali sicil + eşleşme doğrulama (her satış öncesi). */
async function refreshPcLinkFromDevice(settingsInput: HuginSettings): Promise<{
  settings: HuginSettings;
  error?: string;
}> {
  let settings = normalizePcLinkSettings(settingsInput);
  const base = deviceBaseUrl(settings);
  const result = await huginHttpRequest({
    method: 'GET',
    url: `${base}/v1/settings`,
    headers: pcLinkHeaders(settings, !!settings.serialNo),
    timeoutMs: 10000,
  });

  if (!result.ok && result.status !== 400) {
    const hint = huginResponseHint(parseJsonSafe(result.body), result.body) || result.error;
    return {
      settings,
      error:
        hint ||
        `Yazarkasa ayarları okunamadı (HTTP ${result.status}). IP, PC Link ve eşleşme kontrol edin.`,
    };
  }

  const json = parseJsonSafe(result.body);
  const apiStatus = String(json?.status || '').toUpperCase();
  if (apiStatus && isHuginErrorStatus(apiStatus)) {
    return {
      settings,
      error: extractApiMessage(json) || 'Yazarkasa eşleşmesi geçersiz (VKN/MAC). Bağlantı testi yapın.',
    };
  }

  const sn = extractSerialNo(json);
  if (sn) {
    settings = { ...settings, serialNo: sn };
    saveHuginSettings(settings);
  }
  return { settings };
}

async function ensurePcLinkSerial(settings: HuginSettings): Promise<HuginSettings> {
  const refreshed = await refreshPcLinkFromDevice(settings);
  return refreshed.settings;
}

/** Açık kalmış belge satışı engelleyebilir — bilinen uçları dene, iptal et. */
async function recoverOpenPcLinkDocuments(settings: HuginSettings): Promise<void> {
  const base = deviceBaseUrl(settings);
  const headers = pcLinkHeaders(settings, true);
  const paths = ['/v1/documents/active', '/v1/documents/current', '/v1/documents?status=OPEN'];

  for (const path of paths) {
    const result = await huginHttpRequest({
      method: 'GET',
      url: `${base}${path}`,
      headers,
      timeoutMs: 8000,
    });
    if (!result.ok) continue;
    const json = parseJsonSafe(result.body);
    const directId = extractDocumentId(json, result.body, result.headers);
    if (directId) {
      await cancelPcLinkDocument(directId, settings);
      return;
    }
    const data = json?.data;
    if (Array.isArray(data)) {
      for (const row of data) {
        const id = findDocumentIdDeep(row);
        if (id) await cancelPcLinkDocument(id, settings);
      }
    }
  }
}

async function createPcLinkDocument(
  settings: HuginSettings,
): Promise<{ result: HuginHttpResult; json: Record<string, unknown> | null; documentId: string | null }> {
  const base = deviceBaseUrl(settings);
  const headers = pcLinkHeaders(settings, true);
  const result = await huginHttpRequest({
    method: 'POST',
    url: `${base}/v1/documents`,
    headers,
    body: { docCategory: 'SALE' },
    timeoutMs: 15000,
  });
  const json = parseJsonSafe(result.body);
  const documentId = extractDocumentId(json, result.body, result.headers);
  return { result, json, documentId };
}

function extractSerialNo(json: Record<string, unknown> | null): string | null {
  if (!json) return null;
  const tryObj = (obj: Record<string, unknown>): string | null => {
    for (const key of Object.keys(obj)) {
      if (!/serial|fiscal|sicil/i.test(key)) continue;
      const v = obj[key];
      if (typeof v === 'string' && v.trim()) return v.trim();
      if (typeof v === 'number' && Number.isFinite(v)) return String(v);
    }
    return null;
  };
  const data = json.data;
  if (data && typeof data === 'object') {
    const sn = tryObj(data as Record<string, unknown>);
    if (sn) return sn;
  }
  return tryObj(json);
}

function mapPaymentType(method: 'cash' | 'credit_card'): string {
  return method === 'cash' ? 'CASH' : 'EFT_POS';
}

export function classifyHuginFailure(
  errText: string,
  status = 0,
  body = '',
): HuginFailureKind {
  const blob = `${errText} ${body}`.toLowerCase();
  if (
    /kart|card|pos|eft|declin|red|geçmedi|gecmedi|redded|onaylanmad|iptal.*kart|müşteri.*iptal|musteri.*iptal|pin|chip/i.test(
      blob,
    )
  ) {
    return 'card_declined';
  }
  if (/zaman\s*aşım|timeout|timed\s*out/i.test(blob) || status === 0) {
    return 'timeout';
  }
  if (/iptal|cancel|abort|void|vazgeç|vazgec/i.test(blob)) {
    return 'cancelled';
  }
  if (/meşgul|mesgul|busy|işlem\s*devam|locked|kilit/i.test(blob)) {
    return 'device_busy';
  }
  return 'generic';
}

/** Açık kalmış PC Link belgesini iptal et (DELETE). */
export async function cancelPcLinkDocument(
  documentId: string,
  settingsInput?: HuginSettings,
): Promise<{ success: boolean; error?: string }> {
  const settings = normalizeSettings(settingsInput || loadHuginSettings());
  if (!documentId.trim()) return { success: true };
  if (settings.apiMode !== 'pc_link') {
    return { success: false, error: 'Belge iptali yalnızca PC Link (S1) modunda desteklenir.' };
  }

  const base = deviceBaseUrl(settings);
  const headers = pcLinkHeaders(settings, true);
  const url = `${base}/v1/documents/${encodeURIComponent(documentId)}`;

  const del = await huginHttpRequest({
    method: 'DELETE',
    url,
    headers,
    timeoutMs: 12000,
  });
  if (del.ok || del.status === 204 || del.status === 404) {
    return { success: true };
  }

  const cancelPut = await huginHttpRequest({
    method: 'PUT',
    url,
    headers,
    body: { status: 'CANCELLED', items: [], payments: [] },
    timeoutMs: 12000,
  });
  if (cancelPut.ok) return { success: true };

  const detail =
    parseJsonSafe(del.body)?.message ||
    parseJsonSafe(cancelPut.body)?.message ||
    del.error ||
    cancelPut.error ||
    `HTTP ${del.status}`;
  return {
    success: false,
    error: typeof detail === 'string' ? detail : 'Yazarkasa belgesi iptal edilemedi',
  };
}

// ——— TPS (github.com/huginsdk/tps) ———

function buildTpsSalePayload(req: HuginSaleRequest, settings: HuginSettings) {
  const saleItems = req.items.map((item) => ({
    Quantity: item.quantity,
    Amount: item.totalPrice,
    Price: item.unitPrice,
    DepartmentId: item.categoryDepartmentId ?? settings.departmentId,
    VatRate: item.productVatRate ?? settings.vatRate,
    Definition: item.productName.substring(0, 48),
  }));

  const payItems = req.payments.map((p) => ({
    Amount: p.amount,
    PaymentType: p.method === 'cash' ? 0 : 3,
  }));

  return {
    OkcId: settings.okcId,
    OkcPassword: settings.password,
    DocumentType: 1,
    CashierNum: 1,
    SaleItems: saleItems,
    PayItems: payItems,
    SalesTotal: req.totalAmount,
  };
}

async function sendTpsSale(req: HuginSaleRequest, settings: HuginSettings): Promise<HuginSaleResult> {
  const payload = buildTpsSalePayload(req, settings);
  const base = deviceBaseUrl(settings);
  const url = `${base}/TPSService/sale?okc_id=${encodeURIComponent(settings.okcId)}&password=${encodeURIComponent(settings.password)}`;

  const result = await huginHttpRequest({
    method: 'POST',
    url,
    body: payload,
    timeoutMs: 15000,
  });

  if (result.ok) return { success: true };
  const detail = result.body?.slice(0, 200) || result.error || 'Bilinmeyen';
  const err = `Yazarkasa hatası (HTTP ${result.status || '—'}): ${detail}`;
  return { success: false, error: err, failureKind: classifyHuginFailure(err, result.status, result.body) };
}

async function testTpsConnection(settings: HuginSettings): Promise<{ success: boolean; error?: string; serialNo?: string }> {
  const base = deviceBaseUrl(settings);
  const url = `${base}/TPSService/settings?okc_id=${encodeURIComponent(settings.okcId)}&password=${encodeURIComponent(settings.password)}`;

  const result = await huginHttpRequest({
    method: 'POST',
    url,
    body: {},
    timeoutMs: 8000,
  });

  if (result.ok || result.status === 400) return { success: true };
  return { success: false, error: result.error || `HTTP ${result.status}` };
}

// ——— PC Link (developer.hugin.com.tr) ———

async function sendPcLinkSale(req: HuginSaleRequest, settingsInput: HuginSettings): Promise<HuginSaleResult> {
  const hasCard = req.payments.some((p) => p.method === 'credit_card');
  const completeTimeoutMs = hasCard ? 120_000 : 45_000;

  const refreshed = await refreshPcLinkFromDevice(settingsInput);
  if (refreshed.error) {
    return { success: false, error: refreshed.error, failureKind: 'generic' };
  }
  let settings = refreshed.settings;

  if (!settings.serialNo?.trim()) {
    return {
      success: false,
      error:
        'Yazarkasa eşleşmesi yok. Cihazda PC Link → VKN girin, «Eşleşme bekleniyor» iken Ayarlar → Yazarkasa → Bağlantı testi yapın.',
      failureKind: 'generic',
    };
  }

  await recoverOpenPcLinkDocuments(settings);

  let create = await createPcLinkDocument(settings);
  if (!create.documentId && create.result.ok) {
    await recoverOpenPcLinkDocuments(settings);
    create = await createPcLinkDocument(settings);
  }

  const { result: createResult, json: createdJson, documentId } = create;

  if (!createResult.ok) {
    const errText =
      huginResponseHint(createdJson, createResult.body) ||
      createResult.error ||
      'Belge başlatılamadı';
    const err = `PC Link belge açma (HTTP ${createResult.status}): ${errText}`;
    return {
      success: false,
      error: err,
      failureKind: classifyHuginFailure(err, createResult.status, createResult.body),
    };
  }

  if (!documentId) {
    const apiStatus = String(createdJson?.status || '').toUpperCase();
    const hint = huginResponseHint(createdJson, createResult.body) || '(boş yanıt)';
    if (apiStatus && isHuginErrorStatus(apiStatus)) {
      return {
        success: false,
        error: `PC Link: ${hint}`,
        failureKind: 'generic',
      };
    }
    return {
      success: false,
      error:
        `Belge kimliği alınamadı. Eşleşme (VKN/MAC/mali sicil) ve PC Link açık mı kontrol edin. Yanıt: ${hint}`,
      failureKind: 'generic',
    };
  }

  const base = deviceBaseUrl(settings);
  const headers = pcLinkHeaders(settings, true);

  const items = req.items.map((item) => {
    const qty = Math.max(1, Math.round(Number(item.quantity) || 1));
    const unit = item.unitPrice > 0 ? item.unitPrice : item.totalPrice / qty;
    const row: Record<string, string | number> = {
      name: item.productName.substring(0, 48),
      amount: formatHuginAmount(item.totalPrice),
      vatRate: item.productVatRate ?? settings.vatRate,
    };
    if (qty > 1) {
      row.quantity = qty;
      row.price = formatHuginAmount(unit);
    }
    const dept = item.categoryDepartmentId ?? settings.departmentId;
    if (dept > 0) row.departmentId = dept;
    return row;
  });

  const payments = req.payments.map((p) => ({
    type: mapPaymentType(p.method),
    amount: formatHuginAmount(p.amount),
  }));

  const completeBody: Record<string, unknown> = { items, payments };
  if (req.discountAmount > 0) {
    completeBody.discountAmount = formatHuginAmount(req.discountAmount);
  }

  const complete = await huginHttpRequest({
    method: 'PUT',
    url: `${base}/v1/documents/${encodeURIComponent(documentId)}`,
    headers,
    body: completeBody,
    timeoutMs: completeTimeoutMs,
  });

  if (complete.ok) return { success: true, documentId };

  const msg = parseJsonSafe(complete.body);
  const errText =
    (msg && typeof msg.message === 'string' && msg.message) ||
    complete.body?.slice(0, 180) ||
    complete.error ||
    'Satış tamamlanamadı';
  const err = `PC Link satış (HTTP ${complete.status}): ${errText}`;
  return {
    success: false,
    error: err,
    documentId,
    failureKind: classifyHuginFailure(err, complete.status, complete.body),
  };
}

async function testPcLinkConnection(
  settingsInput: HuginSettings,
): Promise<{ success: boolean; error?: string; serialNo?: string }> {
  const refreshed = await refreshPcLinkFromDevice(settingsInput);
  if (refreshed.error) return { success: false, error: refreshed.error };
  const settings = refreshed.settings;
  const serialNo = settings.serialNo.trim();
  if (!serialNo) {
    return {
      success: false,
      error: 'Mali sicil alınamadı. Cihazda «Eşleşme bekleniyor» açıkken tekrar deneyin.',
    };
  }

  await recoverOpenPcLinkDocuments(settings);
  const probe = await createPcLinkDocument(settings);
  if (!probe.result.ok) {
    const hint = huginResponseHint(probe.json, probe.result.body) || probe.result.error || 'Belge açılamadı';
    return {
      success: false,
      error: `Belge testi (HTTP ${probe.result.status}): ${hint}`,
      serialNo,
    };
  }
  if (!probe.documentId) {
    const hint = huginResponseHint(probe.json, probe.result.body) || '(boş yanıt)';
    return {
      success: false,
      error: `Belge testi: kimlik alınamadı. Yanıt: ${hint}`,
      serialNo,
    };
  }

  await cancelPcLinkDocument(probe.documentId, settings);
  return { success: true, serialNo };
}

function validateSettings(settings: HuginSettings): string | null {
  if (!settings.deviceIp.trim()) return 'Cihaz IP adresi boş.';
  if (!huginRequiresDesktop()) return desktopRequiredError().error!;

  if (settings.apiMode === 'pc_link') {
    if (!settings.softwareId.trim()) return 'PC Link için Yazılım ID (VKN) gerekli.';
    if (!settings.hardwareId.trim()) return 'PC Link için Donanım ID (MAC) gerekli — “MAC al” ile doldurun.';
    return null;
  }

  if (!settings.okcId.trim()) return 'TPS için OKC ID gerekli.';
  return null;
}

/** Ödeme sonrası yazarkasayı arka planda çalıştır; kasa ekranı bekletilmez. */
export function runHuginSaleInBackground(
  salePromise: Promise<HuginSaleResult>,
  payments: Array<{ payment_method?: string | null; amount?: number | null }>,
): void {
  const hasCard = paymentsForHugin(payments).some((p) => p.method === 'credit_card');
  dispatchPrintToast({
    kind: 'queued',
    message: hasCard ? 'Kart geçiliyor…' : 'Fiş basılıyor…',
    target: 'Hugin',
    durationMs: 10_000,
  });
  void salePromise.then((result) => {
    if (result.skipped) return;
    if (result.success) {
      dispatchPrintToast({
        kind: 'success',
        message: hasCard ? 'Kart işlemi tamamlandı' : 'Mali fiş yazdırıldı',
        target: 'Hugin',
      });
      return;
    }
    dispatchPrintToast({
      kind: 'error',
      message: hasCard ? 'Kart işlemi tamamlanamadı' : 'Fiş basılamadı',
      detail: result.error,
      target: 'Hugin',
    });
  });
}

export async function sendSaleToHugin(req: HuginSaleRequest): Promise<HuginSaleResult> {
  let settings = normalizeSettings(loadHuginSettings());
  if (settings.apiMode === 'pc_link') {
    settings = normalizePcLinkSettings(settings);
  }

  if (!settings.enabled) {
    return { success: true, skipped: true };
  }

  if (!req.items?.length) {
    return { success: false, error: 'Yazarkasaya gönderilecek kalem yok.' };
  }

  const validation = validateSettings(settings);
  if (validation) return { success: false, error: validation };

  if (settings.apiMode === 'pc_link' && !settings.serialNo.trim()) {
    settings = await ensurePcLinkSerial(settings);
  }

  if (settings.apiMode === 'pc_link' && !settings.serialNo.trim()) {
    return {
      success: false,
      error:
        'PC Link mali sicil (X-SerialNo) yok. Cihazda eşleşme beklenirken Ayarlar → Yazarkasa → Bağlantı testi yapın.',
    };
  }

  if (settings.apiMode === 'pc_link') {
    return sendPcLinkSale(req, settings);
  }
  return sendTpsSale(req, settings);
}

export async function testHuginConnection(
  settingsInput: HuginSettings,
): Promise<{ success: boolean; error?: string; serialNo?: string }> {
  const settings = normalizeSettings(settingsInput);

  if (!settings.deviceIp.trim()) {
    return { success: false, error: 'IP adresi boş' };
  }

  const validation = validateSettings(settings);
  if (validation) return { success: false, error: validation };

  if (settings.apiMode === 'pc_link') {
    return testPcLinkConnection(settings);
  }
  return testTpsConnection(settings);
}

/** Electron’dan birincil ağ arayüzü MAC adresi (PC Link X-HardwareId). */
export async function fetchHuginHardwareId(): Promise<string> {
  const api = (window as any).electronAPI;
  if (api?.getMacAddress) {
    const mac = await api.getMacAddress();
    return typeof mac === 'string' ? mac.trim().toUpperCase() : '';
  }
  return '';
}
