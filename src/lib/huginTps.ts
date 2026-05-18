/** Hugin yazarkasa — TPS (HTTP/3001) ve PC Link S1 (HTTPS/4443). Bkz. developer.hugin.com.tr */

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
  categoryVatRate?: number | null;
  categoryDepartmentId?: number | null;
}

export interface HuginPaymentSplit {
  method: 'cash' | 'credit_card';
  amount: number;
}

export interface HuginSaleRequest {
  orderNumber: number;
  tableLabel: string;
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

// ——— TPS (github.com/huginsdk/tps) ———

function buildTpsSalePayload(req: HuginSaleRequest, settings: HuginSettings) {
  const saleItems = req.items.map((item) => ({
    Quantity: item.quantity,
    Amount: item.totalPrice,
    Price: item.unitPrice,
    DepartmentId: item.categoryDepartmentId ?? settings.departmentId,
    VatRate: item.categoryVatRate ?? settings.vatRate,
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
    FooterNotes: [`Masa: ${req.tableLabel}`, `Siparis No: ${req.orderNumber}`],
  };
}

async function sendTpsSale(req: HuginSaleRequest, settings: HuginSettings): Promise<{ success: boolean; error?: string }> {
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
  const detail = result.body?.slice(0, 200) || result.error;
  return { success: false, error: `Yazarkasa hatası (HTTP ${result.status || '—'}): ${detail || 'Bilinmeyen'}` };
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

async function sendPcLinkSale(req: HuginSaleRequest, settings: HuginSettings): Promise<{ success: boolean; error?: string }> {
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
    return {
      success: false,
      error: `PC Link belge açma (HTTP ${create.status}): ${errText}`,
    };
  }

  const created = parseJsonSafe(create.body);
  const documentId = extractDocumentId(created);
  if (!documentId) {
    return { success: false, error: 'PC Link yanıtında belge kimliği alınamadı. Cihaz eşleşmesini kontrol edin.' };
  }

  const items = req.items.map((item) => {
    const row: Record<string, string | number> = {
      name: item.productName.substring(0, 48),
      amount: formatMoney(item.totalPrice),
      vatRate: item.categoryVatRate ?? settings.vatRate,
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
  const footer = [`Masa: ${req.tableLabel}`, `Sipariş: ${req.orderNumber}`].join(' · ');
  if (footer) completeBody.footerNotes = [footer];

  const complete = await huginHttpRequest({
    method: 'PUT',
    url: `${base}/v1/documents/${encodeURIComponent(documentId)}`,
    headers,
    body: completeBody,
    timeoutMs: 20000,
  });

  if (complete.ok) return { success: true };

  const msg = parseJsonSafe(complete.body);
  const errText =
    (msg && typeof msg.message === 'string' && msg.message) ||
    complete.body?.slice(0, 180) ||
    complete.error ||
    'Satış tamamlanamadı';
  return { success: false, error: `PC Link satış (HTTP ${complete.status}): ${errText}` };
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

export async function sendSaleToHugin(req: HuginSaleRequest): Promise<{ success: boolean; error?: string }> {
  const settings = normalizeSettings(loadHuginSettings());

  if (!settings.enabled) {
    return { success: true };
  }

  const validation = validateSettings(settings);
  if (validation) return { success: false, error: validation };

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
