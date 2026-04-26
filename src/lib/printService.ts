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

export interface PrintSettings {
  printers: PrinterConfig[];
  defaultReceiptPrinter: string;
  defaultTakeawayPrinter: string;
  autoPrintKitchen: boolean;
  autoPrintReceipt: boolean;
  autoPrintTakeaway: boolean;
  restaurantName: string;
  restaurantPhone: string;
  restaurantAddress: string;
  receiptFooter: string;
  disabledCategoryIds: string[];
}

import { supabase } from './supabase';

const PRINT_SETTINGS_KEY = 'shefpos_print_settings';
const PRINT_AGENT_URL = 'http://127.0.0.1:7878';

let _currentBranchId: string | null = null;
let _currentTenantId: string | null = null;

export function setPrintAgentBranchId(branchId: string | null) {
  _currentBranchId = branchId;
}

export function setPrintAgentTenantId(tenantId: string | null) {
  _currentTenantId = tenantId;
}

export function loadPrintSettings(): PrintSettings {
  try {
    const raw = localStorage.getItem(PRINT_SETTINGS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {
    printers: [],
    defaultReceiptPrinter: '',
    defaultTakeawayPrinter: '',
    autoPrintKitchen: true,
    autoPrintReceipt: false,
    autoPrintTakeaway: true,
    restaurantName: '',
    restaurantPhone: '',
    restaurantAddress: '',
    receiptFooter: 'Teşekkür ederiz, iyi günler!',
    disabledCategoryIds: [],
  };
}

export function savePrintSettings(settings: PrintSettings) {
  localStorage.setItem(PRINT_SETTINGS_KEY, JSON.stringify(settings));
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

export function buildKitchenHtml(opts: {
  restaurantName: string;
  tableLabel: string;
  orderNumber: string;
  items: KitchenPrintItem[];
  note?: string;
  time?: string;
}): string {
  const time = opts.time || new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  const date = new Date().toLocaleDateString('tr-TR');

  let html = `
    <div class="center bold xlarge">${opts.restaurantName || 'MUTFAK FİŞİ'}</div>
    <div class="line"></div>
    <div class="center bold large">${opts.tableLabel}</div>
    <div class="center">${date} ${time}</div>
    ${opts.orderNumber ? `<div class="center">Sipariş: ${opts.orderNumber}</div>` : ''}
    <div class="line"></div>
    <div class="row bold">
      <span class="name">URUN</span><span class="qty">ADT</span><span class="price"></span>
    </div>
    <div class="line"></div>
  `;

  opts.items.forEach(item => {
    const label = item.variantName ? `${item.productName} (${item.variantName})` : item.productName;
    html += `<div class="row bold xlarge"><span class="name">${label}</span><span class="qty">${item.quantity}</span><span class="price"></span></div>`;
    if (item.notes) {
      html += `<div class="note">Not: ${item.notes}</div>`;
    }
  });

  if (opts.note) {
    html += `<div class="line"></div><div class="note bold">Genel Not: ${opts.note}</div>`;
  }

  html += `<div class="line"></div>`;
  html += `<div class="footer">*** MUTFAK KOPYASI ***</div>`;
  html += `<br><br><br>`;

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
}): string {
  const time = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  const date = new Date().toLocaleDateString('tr-TR');

  const paymentLabels: Record<string, string> = {
    cash: 'Nakit',
    credit_card: 'Kredi Kartı',
    open_account: 'Veresiye',
    mixed: 'Karışık',
  };

  let html = `
    <div class="center bold xlarge">${opts.restaurantName || 'ŞefPOS'}</div>
    ${opts.restaurantAddress ? `<div class="center" style="font-size:11px">${opts.restaurantAddress}</div>` : ''}
    ${opts.restaurantPhone ? `<div class="center" style="font-size:11px">Tel: ${opts.restaurantPhone}</div>` : ''}
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
  html += `<div class="total-row" style="font-size:16px"><span>TOPLAM</span><span>${fmt(opts.total)}₺</span></div>`;
  if (opts.paymentMethod) {
    html += `<div class="row"><span>Ödeme</span><span>${paymentLabels[opts.paymentMethod] || opts.paymentMethod}</span></div>`;
  }
  html += `<div class="line"></div>`;
  html += `<div class="footer">${opts.footer || 'Teşekkür ederiz, iyi günler!'}</div>`;
  html += `<div class="line" style="margin-top:6px"></div>`;
  html += `<div class="center" style="font-size:10px; margin-top:4px">Bilgi fişidir. Mali değeri yoktur.</div>`;
  html += `<br><br><br>`;

  return html;
}

export async function printHtml(html: string, printerName: string): Promise<{ success: boolean; error?: string }> {
  const w = window as any;

  if (w.electronAPI?.printReceipt) {
    try {
      const result = await w.electronAPI.printReceipt({ html, printerName: printerName || undefined, silent: true });
      return { success: result.success, error: result.errorType || undefined };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  if (_currentTenantId || _currentBranchId) {
    try {
      const { error } = await supabase.from('print_jobs').insert({
        tenant_id: _currentTenantId || null,
        branch_id: _currentBranchId || null,
        html,
        printer_name: printerName || '',
        status: 'pending',
      });
      if (!error) {
        return { success: true };
      }
      console.error('Supabase print job eklenemedi:', error.message);
    } catch (err: any) {
      console.error('Supabase print job hatası:', err.message);
    }
  }

  try {
    const res = await fetch(`${PRINT_AGENT_URL}/print`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ html, printerName: printerName || undefined, silent: true }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json();
    return { success: data.success, error: data.errorType || data.error || undefined };
  } catch (err: any) {
    return { success: false, error: 'Print Agent bulunamadı. Masaüstü uygulamanın açık olduğundan emin olun.' };
  }
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
}): string {
  const time = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  const date = new Date().toLocaleDateString('tr-TR');
  const isDelivery = opts.orderType === 'delivery';

  let html = `
    <div class="center bold xlarge">${opts.restaurantName || 'ŞefPOS'}</div>
    ${opts.restaurantAddress ? `<div class="center" style="font-size:11px">${opts.restaurantAddress}</div>` : ''}
    ${opts.restaurantPhone ? `<div class="center" style="font-size:11px">Tel: ${opts.restaurantPhone}</div>` : ''}
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
  html += `<div class="total-row" style="font-size:16px"><span>TOPLAM</span><span>${fmt(opts.total)}₺</span></div>`;
  html += `<div class="line"></div>`;
  html += `<div class="footer">${opts.footer || 'Teşekkür ederiz!'}</div>`;
  html += `<br><br><br>`;
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
  const takeawayPrinters = settings.printers.filter(p => p.enabled && p.type === 'takeaway');
  const printerName = takeawayPrinters.length > 0
    ? takeawayPrinters[0].printerName
    : (settings.defaultTakeawayPrinter || settings.defaultReceiptPrinter || '');

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
  });

  await printHtml(html, printerName);
}

export async function printKitchenReceipts(opts: {
  settings: PrintSettings;
  restaurantName: string;
  tableLabel: string;
  orderNumber: string;
  items: KitchenPrintItem[];
  note?: string;
  categories: { id: string; name: string }[];
}): Promise<void> {
  const { settings, items } = opts;

  if (items.length === 0) return;

  const kitchenPrinters = settings.printers.filter(p => p.enabled && p.type !== 'receipt');

  if (kitchenPrinters.length === 0) {
    const html = buildKitchenHtml({
      restaurantName: opts.restaurantName,
      tableLabel: opts.tableLabel,
      orderNumber: opts.orderNumber,
      items,
      note: opts.note,
    });
    await printHtml(html, settings.defaultReceiptPrinter || '');
    return;
  }

  const printedKeys = new Set<string>();

  const printerItemsMap: Record<string, KitchenPrintItem[]> = {};

  for (const item of items) {
    let targetPrinterName: string | null = null;

    if (item.productPrinterName) {
      targetPrinterName = item.productPrinterName;
    } else {
      const matchedPrinter = kitchenPrinters.find(p =>
        p.categoryIds.length > 0 && item.categoryId && p.categoryIds.includes(item.categoryId)
      );
      if (matchedPrinter) {
        targetPrinterName = matchedPrinter.printerName;
      } else {
        const catchAllPrinter = kitchenPrinters.find(p => p.categoryIds.length === 0);
        if (catchAllPrinter) {
          targetPrinterName = catchAllPrinter.printerName;
        } else {
          targetPrinterName = kitchenPrinters[0].printerName;
        }
      }
    }

    if (!targetPrinterName) continue;
    if (!printerItemsMap[targetPrinterName]) printerItemsMap[targetPrinterName] = [];
    printerItemsMap[targetPrinterName].push(item);
  }

  for (const [printerName, printerItems] of Object.entries(printerItemsMap)) {
    if (printerItems.length === 0) continue;

    const key = `${printerName}:${printerItems.map(i => i.productName).join(',')}`;
    if (printedKeys.has(key)) continue;
    printedKeys.add(key);

    const html = buildKitchenHtml({
      restaurantName: opts.restaurantName,
      tableLabel: opts.tableLabel,
      orderNumber: opts.orderNumber,
      items: printerItems,
      note: opts.note,
    });

    await printHtml(html, printerName);
  }
}
