import { useEffect, useState } from 'react';
import { X, Printer, ExternalLink, Loader2, Banknote, CreditCard } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import {
  buildReceiptHtml,
  loadPrintSettings,
  printOnlineOrderReceiptFromEdge,
  printToAdisyonPrinter,
} from '../../lib/printService';
import { dispatchPrintToast } from '../../lib/printToasts';
import {
  formatMoneyTr,
  formatOrderPaymentStatus,
  formatPaymentMethodLabel,
  formatRelativeTr,
  parseRecentActivityRefId,
  type RecentActivityRow,
} from '../../lib/electronDashboardData';

type DetailItem = {
  name: string;
  variant?: string | null;
  qty: number;
  total: number;
  notes?: string | null;
};

type PaymentLine = {
  label: string;
  amount?: number;
};

type DetailState = {
  orderNumber?: string;
  tableLabel?: string;
  paymentSummary: string;
  paymentLines: PaymentLine[];
  subtotal?: number;
  tax?: number;
  discount?: number;
  total: number;
  items: DetailItem[];
};

interface Props {
  row: RecentActivityRow;
  onClose: () => void;
  onNavigate?: (page: string) => void;
}

async function fetchOrderItems(orderId: string): Promise<{ data: Record<string, unknown>[] | null; error: string | null }> {
  const baseSelect =
    'product_name, variant_name, quantity, unit_price, total_amount, notes, cancelled_at';

  const withCancel = await supabase
    .from('order_items')
    .select(baseSelect)
    .eq('order_id', orderId)
    .is('cancelled_at', null)
    .order('created_at', { ascending: true });

  if (!withCancel.error) {
    return { data: (withCancel.data || []) as Record<string, unknown>[], error: null };
  }

  const plain = await supabase
    .from('order_items')
    .select('product_name, variant_name, quantity, unit_price, total_amount, notes')
    .eq('order_id', orderId)
    .order('created_at', { ascending: true });

  if (plain.error) {
    return { data: null, error: plain.error.message };
  }
  return { data: (plain.data || []) as Record<string, unknown>[], error: null };
}

function buildPaymentSummary(
  txs: { payment_method: string; amount: number }[],
  order?: {
    payment_method?: string | null;
    payment_status?: string | null;
    status?: string | null;
  },
): { summary: string; lines: PaymentLine[] } {
  if (txs.length > 0) {
    const lines = txs.map((t) => ({
      label: formatPaymentMethodLabel(t.payment_method) || 'Ödeme',
      amount: Number(t.amount) || 0,
    }));
    const summary =
      lines.length === 1
        ? `${lines[0].label}${lines[0].amount ? ` · ${formatMoneyTr(lines[0].amount)}` : ''}`
        : lines.map((l) => `${l.label} ${formatMoneyTr(l.amount || 0)}`).join(' + ');
    return { summary, lines };
  }

  const method = formatPaymentMethodLabel(order?.payment_method);
  if (method) {
    return { summary: method, lines: [{ label: method }] };
  }

  const ps = formatOrderPaymentStatus(order?.payment_status);
  if (ps) {
    return { summary: ps, lines: [{ label: ps }] };
  }

  const st = String(order?.status || '').toLowerCase();
  if (st === 'active' || st === 'open') {
    return { summary: 'Ödenmedi', lines: [{ label: 'Ödenmedi' }] };
  }

  return { summary: 'Ödeme bilgisi yok', lines: [] };
}

export function RecentActivityDetailModal({ row, onClose, onNavigate }: Props) {
  const { tenant } = useAuth();
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<DetailState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setDetail(null);

    const refs = parseRecentActivityRefId(row);

    void (async () => {
      try {
        if (row.kind === 'online') {
          const onlineOrderId = refs.onlineOrderId || row.onlineOrderId;
          if (!onlineOrderId) {
            setLoadError('Sipariş bulunamadı');
            return;
          }

          const { data: orderRow, error: orderErr } = await supabase
            .from('online_orders')
            .select(
              'id, customer_name, total_amount, status, platform_order_number, payment_status',
            )
            .eq('id', onlineOrderId)
            .maybeSingle();

          if (cancelled) return;
          if (orderErr || !orderRow) {
            console.warn('[ŞefPOS] online_orders detay:', orderErr?.message);
            setLoadError('Sipariş detayı yüklenemedi');
            return;
          }

          const { data: itemRows, error: itemsErr } = await supabase
            .from('online_order_items')
            .select('platform_product_name, quantity, unit_price, total_amount, notes')
            .eq('online_order_id', onlineOrderId)
            .order('created_at', { ascending: true });

          if (cancelled) return;
          if (itemsErr) {
            console.warn('[ŞefPOS] online_order_items:', itemsErr.message);
          }

          const payLabel =
            formatOrderPaymentStatus(String((orderRow as any).payment_status || 'paid')) ||
            'Platform ödemeli';

          setDetail({
            orderNumber: String((orderRow as any).platform_order_number || ''),
            tableLabel: String((orderRow as any).customer_name || 'Online'),
            paymentSummary: payLabel,
            paymentLines: [{ label: payLabel }],
            total: Number((orderRow as any).total_amount) || row.amount,
            items: (itemRows || []).map((it: Record<string, unknown>) => ({
              name: String(it.platform_product_name || 'Ürün'),
              qty: Number(it.quantity) || 1,
              total: Number(it.total_amount ?? it.unit_price) || 0,
              notes: it.notes ? String(it.notes) : null,
            })),
          });
          return;
        }

        const orderId = refs.orderId || row.orderId;
        if (!orderId) {
          setLoadError('Sipariş bulunamadı');
          return;
        }

        const { data: order, error: orderErr } = await supabase
          .from('orders')
          .select(
            'id, order_number, total_amount, subtotal, tax_amount, discount_amount, status, payment_method, payment_status, order_type, table_id',
          )
          .eq('id', orderId)
          .maybeSingle();

        if (cancelled) return;
        if (orderErr || !order) {
          console.warn('[ŞefPOS] orders detay:', orderErr?.message);
          setLoadError('Sipariş detayı yüklenemedi');
          return;
        }

        const [itemsResult, payRes, tableRes] = await Promise.all([
          fetchOrderItems(orderId),
          supabase
            .from('payment_transactions')
            .select('payment_method, amount')
            .eq('order_id', orderId)
            .order('created_at', { ascending: true }),
          (order as { table_id?: string | null }).table_id
            ? supabase
                .from('restaurant_tables')
                .select('table_number')
                .eq('id', (order as { table_id: string }).table_id)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null }),
        ]);

        if (cancelled) return;
        if (itemsResult.error) {
          setLoadError('Kalemler okunamadı');
          return;
        }

        const o = order as Record<string, unknown>;
        const tableNum = (tableRes.data as { table_number?: string | number } | null)?.table_number;
        const orderType = String(o.order_type || '');
        const txs = ((payRes.data || []) as { payment_method: string; amount: number }[]).map((t) => ({
          payment_method: String(t.payment_method),
          amount: Number(t.amount) || 0,
        }));
        const { summary, lines } = buildPaymentSummary(txs, {
          payment_method: o.payment_method as string | null,
          payment_status: o.payment_status as string | null,
          status: o.status as string | null,
        });

        setDetail({
          orderNumber: String(o.order_number || ''),
          tableLabel:
            orderType === 'takeaway'
              ? 'Paket servis'
              : tableNum != null && tableNum !== ''
                ? `Masa ${tableNum}`
                : row.title.startsWith('Masa ')
                  ? row.title
                  : 'Salon',
          paymentSummary: summary,
          paymentLines: lines,
          subtotal: Number(o.subtotal) || undefined,
          tax: Number(o.tax_amount) || undefined,
          discount: Number(o.discount_amount) || undefined,
          total: Number(o.total_amount) || row.amount,
          items: (itemsResult.data || []).map((it) => ({
            name: String(it.product_name || 'Ürün'),
            variant: it.variant_name ? String(it.variant_name) : null,
            qty: Number(it.quantity) || 1,
            total: Number(it.total_amount) || 0,
            notes: it.notes ? String(it.notes) : null,
          })),
        });
      } catch (e) {
        console.warn('[ŞefPOS] işlem detayı:', e);
        if (!cancelled) setLoadError('Bağlantı hatası');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [row]);

  const handlePrint = async () => {
    if (!tenant || !detail) return;
    setPrinting(true);
    try {
      const refs = parseRecentActivityRefId(row);
      if (row.kind === 'online') {
        const id = refs.onlineOrderId || row.onlineOrderId;
        if (!id) return;
        const result = await printOnlineOrderReceiptFromEdge(id, {
          title: `Online fiş — ${row.title}`,
        });
        if (!result.success) {
          dispatchPrintToast({ kind: 'error', message: 'Fiş yazdırılamadı', detail: result.error });
        }
        return;
      }

      const orderId = refs.orderId || row.orderId;
      if (!orderId) return;
      const printSettings = loadPrintSettings();
      const subtotal = detail.subtotal ?? detail.items.reduce((s, r) => s + r.total, 0);
      const tax = detail.tax ?? 0;
      const discount = detail.discount ?? 0;
      const total = detail.total ?? subtotal + tax - discount;

      const html = buildReceiptHtml({
        restaurantName: printSettings.restaurantName || tenant.name || 'ŞefPOS',
        restaurantPhone: printSettings.restaurantPhone,
        restaurantAddress: printSettings.restaurantAddress,
        tableLabel: detail.tableLabel || row.title,
        orderNumber: detail.orderNumber || row.orderNumber || orderId.slice(0, 8),
        items: detail.items.map((r) => ({
          productName: r.name,
          variantName: r.variant || null,
          quantity: r.qty,
          unitPrice: r.qty > 0 ? r.total / r.qty : r.total,
          totalAmount: r.total,
          notes: r.notes || null,
        })),
        subtotal,
        taxAmount: tax,
        discountAmount: discount,
        total,
        paymentMethod: detail.paymentSummary,
        footer: printSettings.receiptFooter,
        printStyle: printSettings.printStyle,
      });

      const result = await printToAdisyonPrinter(printSettings, html, {
        title: `Adisyon — ${detail.tableLabel || row.title}`,
      });
      if (!result.success) {
        dispatchPrintToast({ kind: 'error', message: 'Adisyon yazdırılamadı', detail: result.error });
      }
    } finally {
      setPrinting(false);
    }
  };

  const goModule = () => {
    if (!onNavigate) return;
    onClose();
    if (row.kind === 'online') onNavigate('online-orders');
    else if (row.kind === 'takeaway') onNavigate('takeaway');
    else onNavigate('tables');
  };

  const toneClass =
    row.statusTone === 'open'
      ? 'bg-emerald-100 text-emerald-800'
      : row.statusTone === 'preparing'
        ? 'bg-blue-100 text-blue-800'
        : row.statusTone === 'done'
          ? 'bg-slate-100 text-slate-700'
          : 'bg-amber-100 text-amber-800';

  const PayIcon =
    detail?.paymentSummary.toLowerCase().includes('kart') ||
    detail?.paymentSummary.toLowerCase().includes('kredi')
      ? CreditCard
      : Banknote;

  return (
    <div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-3 md:p-6">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl flex flex-col max-h-[min(90vh,640px)] overflow-hidden">
        <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-slate-200 bg-gradient-to-r from-orange-500 to-orange-600 text-white">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-white/80">İşlem detayı</p>
            <h3 className="text-lg font-black truncate">{row.title}</h3>
            <p className="text-xs text-white/90 mt-0.5">
              {row.subtitle} · {formatRelativeTr(row.created_at)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/20 shrink-0"
            aria-label="Kapat"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-4 py-3 border-b border-slate-100 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${toneClass}`}>{row.status}</span>
            <span className="text-xl font-black text-slate-900 tabular-nums">{formatMoneyTr(row.amount)}</span>
          </div>
          {!loading && detail && (
            <div className="flex items-start gap-2 rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2">
              <PayIcon className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase text-emerald-800/80">Ödeme</p>
                <p className="text-sm font-bold text-emerald-900">{detail.paymentSummary}</p>
                {detail.paymentLines.length > 1 && (
                  <ul className="mt-1 space-y-0.5">
                    {detail.paymentLines.map((p, i) => (
                      <li key={i} className="text-[11px] text-emerald-800">
                        {p.label}
                        {p.amount != null && p.amount > 0 ? ` · ${formatMoneyTr(p.amount)}` : ''}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-500">
              <Loader2 className="w-8 h-8 animate-spin text-orange-500 mb-2" />
              <p className="text-sm font-medium">Yükleniyor…</p>
            </div>
          ) : loadError ? (
            <p className="text-sm text-red-600 text-center py-8">{loadError}</p>
          ) : detail && detail.items.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-8">Kalem bulunamadı</p>
          ) : detail ? (
            <ul className="space-y-2">
              {detail.items.map((it, idx) => (
                <li
                  key={idx}
                  className="flex items-start justify-between gap-2 rounded-lg bg-slate-50 border border-slate-100 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-800">
                      {it.qty > 1 ? `${it.qty}× ` : ''}
                      {it.name}
                      {it.variant ? ` (${it.variant})` : ''}
                    </p>
                    {it.notes ? <p className="text-[11px] text-slate-500 mt-0.5">{it.notes}</p> : null}
                  </div>
                  <span className="text-sm font-black text-slate-800 tabular-nums shrink-0">
                    {formatMoneyTr(it.total)}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="px-4 py-3 border-t border-slate-200 bg-slate-50 flex flex-col sm:flex-row gap-2">
          <button
            type="button"
            onClick={() => void handlePrint()}
            disabled={loading || !!loadError || printing || !detail}
            className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-sm disabled:opacity-50 active:scale-[0.98]"
          >
            {printing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
            {row.kind === 'online' ? 'Fiş yazdır' : 'Adisyon yazdır'}
          </button>
          {onNavigate && (
            <button
              type="button"
              onClick={goModule}
              className="inline-flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl border-2 border-slate-200 bg-white text-slate-700 font-bold text-sm hover:border-orange-300 active:scale-[0.98]"
            >
              <ExternalLink className="w-4 h-4" />
              Ekrana git
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
