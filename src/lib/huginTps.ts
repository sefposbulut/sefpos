export interface HuginSettings {
  enabled: boolean;
  deviceIp: string;
  devicePort: number;
  okcId: string;
  password: string;
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

const SETTINGS_KEY = 'hugin_tps_settings';

export function loadHuginSettings(): HuginSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {
    enabled: false,
    deviceIp: '192.168.1.100',
    devicePort: 3001,
    okcId: '',
    password: '',
    vatRate: 10,
    departmentId: 1,
  };
}

export function saveHuginSettings(settings: HuginSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function buildSalePayload(req: HuginSaleRequest, settings: HuginSettings) {
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

export async function sendSaleToHugin(req: HuginSaleRequest): Promise<{ success: boolean; error?: string }> {
  const settings = loadHuginSettings();

  if (!settings.enabled) {
    return { success: true };
  }

  if (!settings.deviceIp || !settings.okcId) {
    return { success: false, error: 'Hugin ayarlari eksik. Lutfen Ayarlar > Yazarkasa bolumunu doldurun.' };
  }

  const payload = buildSalePayload(req, settings);
  const url = `http://${settings.deviceIp}:${settings.devicePort}/TPSService/sale?okc_id=${encodeURIComponent(settings.okcId)}&password=${encodeURIComponent(settings.password)}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });

    if (response.ok) {
      return { success: true };
    }

    const text = await response.text().catch(() => '');
    return { success: false, error: `Yazarkasa hatasi (HTTP ${response.status}): ${text}` };
  } catch (err: any) {
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
      return { success: false, error: 'Yazarkasaya baglanilamadi: Zaman asimi. IP adresini kontrol edin.' };
    }
    return { success: false, error: `Yazarkasaya baglanilamadi: ${err?.message || 'Bilinmeyen hata'}` };
  }
}

export async function testHuginConnection(settings: HuginSettings): Promise<{ success: boolean; error?: string }> {
  if (!settings.deviceIp) {
    return { success: false, error: 'IP adresi bos' };
  }

  const url = `http://${settings.deviceIp}:${settings.devicePort}/TPSService/settings?okc_id=${encodeURIComponent(settings.okcId)}&password=${encodeURIComponent(settings.password)}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(5000),
    });

    if (response.ok || response.status === 400) {
      return { success: true };
    }
    return { success: false, error: `HTTP ${response.status}` };
  } catch (err: any) {
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
      return { success: false, error: 'Zaman asimi - cihaz bulunamadi' };
    }
    return { success: false, error: err?.message || 'Baglanti hatasi' };
  }
}
