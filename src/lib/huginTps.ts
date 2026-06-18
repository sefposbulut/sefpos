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
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(normalizeSettings(settings)));
}

export function huginRequiresDesktop(): boolean {
  return typeof window !== 'undefined' && !!(window as any).electronAPI?.isElectron;
}

function formatMoney(amount: number): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '0.00';
  return n.toFixed(2);
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
    return { ok: response.ok, status: response.status, body };
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
  const sw = settings.softwareId.trim();
  const hw = settings.hardwareId.trim();
  if (sw) headers['X-SoftwareId'] = sw;
  if (hw) headers['X-HardwareId'] = hw;
  if (includeSerial && settings.serialNo.trim()) {
    headers['X-SerialNo'] = settings.serialNo.trim();
  }
  return headers;
}

function extractDocumentId(json: Record<string, unknown> | null): string | null {
  if (!json) return null;
  const data = json.data;
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>;
    for (const key of ['documentId', 'id', 'document_id']) {
      if (typeof d[key] === 'string' && d[key]) return d[key] as string;
    }
  }
  for (const key of ['documentId', 'id']) {
    if (typeof json[key] === 'string' && json[key]) return json[key] as string;
  }
  return null;
}

function extractSerialNo(json: Record<string, unknown> | null): string | null {
  if (!json) return null;
  const data = json.data;
  if (data && typeof data === 'object') {
    const sn = (data as Record<string, unknown>).serialNo;
    if (typeof sn === 'string' && sn.trim()) return sn.trim();
  }
  return null;
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

async function sendPcLinkSale(req: HuginSaleRequest, settings: HuginSettings): Promise<HuginSaleResult> {
  const hasCard = req.payments.some((p) => p.method === 'credit_card');
  const completeTimeoutMs = hasCard ? 120_000 : 45_000;
  const base = deviceBaseUrl(settings);
  const headers = pcLinkHeaders(settings, true);

  const create = await huginHttpRequest({
    method: 'POST',
    url: `${base}/v1/documents`,
    headers,
    body: { docCategory: 'SALE' },
    timeoutMs: 12000,
  });

  if (!create.ok) {
    const msg = parseJsonSafe(create.body);
    const errText =
      (msg && typeof msg.message === 'string' && msg.message) ||
      create.body?.slice(0, 180) ||
      create.error ||
      'Belge başlatılamadı';
    const err = `PC Link belge açma (HTTP ${create.status}): ${errText}`;
    return {
      success: false,
      error: err,
      failureKind: classifyHuginFailure(err, create.status, create.body),
    };
  }

  const created = parseJsonSafe(create.body);
  const documentId = extractDocumentId(created);
  if (!documentId) {
    return {
      success: false,
      error: 'PC Link yanıtında belge kimliği alınamadı. Cihaz eşleşmesini kontrol edin.',
      failureKind: 'generic',
    };
  }

  const items = req.items.map((item) => {
    const qty = Math.max(1, Math.round(Number(item.quantity) || 1));
    const row: Record<string, string | number> = {
      name: item.productName.substring(0, 48),
      quantity: qty,
      amount: formatMoney(item.totalPrice),
      price: formatMoney(item.unitPrice > 0 ? item.unitPrice : item.totalPrice / qty),
      vatRate: item.productVatRate ?? settings.vatRate,
    };
    const dept = item.categoryDepartmentId ?? settings.departmentId;
    if (dept > 0) row.departmentId = dept;
    return row;
  });

  const payments = req.payments.map((p) => ({
    type: mapPaymentType(p.method),
    amount: formatMoney(p.amount),
  }));

  const completeBody: Record<string, unknown> = { items, payments };
  if (req.discountAmount > 0) {
    completeBody.discountAmount = formatMoney(req.discountAmount);
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
  settings: HuginSettings,
): Promise<{ success: boolean; error?: string; serialNo?: string }> {
  const base = deviceBaseUrl(settings);
  const hasSerial = !!settings.serialNo.trim();
  const result = await huginHttpRequest({
    method: 'GET',
    url: `${base}/v1/settings`,
    headers: pcLinkHeaders(settings, hasSerial),
    timeoutMs: 8000,
  });

  if (!result.ok && result.status !== 400) {
    if (result.error) return { success: false, error: result.error };
    return {
      success: false,
      error: `Bağlantı başarısız (HTTP ${result.status}). Cihazda PC Link açık ve IP doğru mu?`,
    };
  }

  const json = parseJsonSafe(result.body);
  const serialNo = extractSerialNo(json);
  return { success: true, serialNo: serialNo || undefined };
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
  const settings = normalizeSettings(loadHuginSettings());

  if (!settings.enabled) {
    return { success: true, skipped: true };
  }

  if (!req.items?.length) {
    return { success: false, error: 'Yazarkasaya gönderilecek kalem yok.' };
  }

  const validation = validateSettings(settings);
  if (validation) return { success: false, error: validation };

  if (settings.apiMode === 'pc_link' && !settings.serialNo.trim()) {
    return {
      success: false,
      error: 'PC Link mali sicil (X-SerialNo) boş. Ayarlar → Yazarkasa → Bağlantı testi yapın veya sicili girin.',
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
