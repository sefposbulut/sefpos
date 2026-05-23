import { useEffect, useMemo, useState } from 'react';
import { X, Printer, Search, RefreshCw, Calendar, Receipt } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
  buildReceiptHtml,
  loadPrintSettings,
  printToAdisyonPrinter,
} from '../lib/printService';
import { dispatchPrintToast } from '../lib/printToasts';

interface ReprintReceiptModalProps {
  onClose: () => void;
  /** Yalnızca bu masanın siparişleri (sipariş panelinden açılırsa). */
  filterTableId?: string | null;
  filterTableNumber?: number | null;
}

interface OrderRow {
  id: string;
  order_number: string | null;
  total_amount: number | null;
  subtotal: number | null;
  tax_amount: number | null;
  discount_amount: number | null;
  status: string | null;
  payment_method: string | null;
  order_type: string | null;
  table_id: string | null;
  created_at: string;
  closed_at?: string | null;
  table_number?: number | null;
  table_label?: string | null;
}

interface OrderItemRow {
  id: string;
  product_id: string | null;
  product_name: string | null;
  variant_name: string | null;
  quantity: number;
  unit_price: number;
  total_amount: number;
  notes: string | null;
}

type Period = 'today' | 'yesterday' | 'last7' | 'last30';

const PERIOD_LABELS: Record<Period, string> = {
  today: 'Bugün',
  yesterday: 'Dün',
  last7: 'Son 7 gün',
  last30: 'Son 30 gün',
};

function periodRange(p: Period): { start: string; end: string } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (p === 'today') {
    return {
      start: today.toISOString(),
      end: new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1).toISOString(),
    };
  }
  if (p === 'yesterday') {
    const y = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    return {
      start: y.toISOString(),
      end: new Date(today.getTime() - 1).toISOString(),
    };
  }
  if (p === 'last7') {
    return {
      start: new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      end: new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1).toISOString(),
    };
  }
  return {
    start: new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    end: new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1).toISOString(),
  };
}

export function ReprintReceiptModal({
  onClose,
  filterTableId = null,
  filterTableNumber = null,
}: ReprintReceiptModalProps) {
  const { tenant, activeBranch } = useAuth();
  const [period, setPeriod] = useState<Period>('last7');
  const [search, setSearch] = useState('');
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [printingId, setPrintingId] = useState<string | null>(null);

  const load = async () => {
    if (!tenant) return;
    setLoading(true);
    setFetchError(null);
    try {
      const { start, end } = periodRange(period);
      let q: any = supabase
        .from('orders')
        .select(
          'id, order_number, total_amount, subtotal, tax_amount, discount_amount, status, payment_method, order_type, table_id, created_at, closed_at, restaurant_tables(table_number)',
        )
        .eq('tenant_id', tenant.id)
        .gte('created_at', start)
        .lte('created_at', end)
        .order('created_at', { ascending: false })
        .limit(200);
      if (activeBranch?.id) {
        q = q.or(`branch_id.eq.${activeBranch.id},branch_id.is.null`);
      }
      if (filterTableId) {
        q = q.eq('table_id', filterTableId);
      }
      const { data, error } = await q;
      if (error) {
        console.warn('[ŞefPOS] geçmiş adisyonlar fetch hatası:', error.message);
        setFetchError(error.message);
        setOrders([]);
      } else {
        const rows: OrderRow[] = (data || []).map((o: any) => {
          const tableNum = o.restaurant_tables?.table_number ?? null;
          return {
            id: o.id,
            order_number: o.order_number,
            total_amount: o.total_amount,
            subtotal: o.subtotal,
            tax_amount: o.tax_amount,
            discount_amount: o.discount_amount,
            status: o.status,
            payment_method: o.payment_method,
            order_type: o.order_type,
            table_id: o.table_id,
            created_at: o.created_at,
            closed_at: o.closed_at,
            table_number: tableNum,
            table_label:
              o.order_type === 'takeaway'
                ? 'Paket'
                : tableNum != null
                  ? `Masa ${tableNum}`
                  : '—',
          };
        });
        setOrders(rows);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [period, tenant?.id, activeBranch?.id, filterTableId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter((o) => {
      if ((o.order_number || '').toLowerCase().includes(q)) return true;
      if (o.table_number != null && String(o.table_number).includes(q)) return true;
      if ((o.payment_method || '').toLowerCase().includes(q)) return true;
      return false;
    });
  }, [orders, search]);

  const handlePrint = async (order: OrderRow) => {
    if (!tenant) return;
    setPrintingId(order.id);
    try {
      const printSettings = loadPrintSettings();

      const { data: items, error: itemsErr } = await (supabase
        .from('order_items') as any)
        .select(
          'id, product_id, product_name, variant_name, quantity, unit_price, total_amount, notes',
        )
        .eq('order_id', order.id)
        .order('created_at', { ascending: true });
      if (itemsErr) {
        console.warn('[ŞefPOS] order_items hatası:', itemsErr.message);
        dispatchPrintToast({
          kind: 'error',
          message: 'Sipariş kalemleri okunamadı',
          detail: itemsErr.message,
        });
        return;
      }

      const rows = (items || []) as OrderItemRow[];
      const subtotal = order.subtotal ?? rows.reduce((s, r) => s + (r.total_amount || 0), 0);
      const tax = order.tax_amount ?? 0;
      const discount = order.discount_amount ?? 0;
      const total = order.total_amount ?? subtotal + tax - discount;

      const html = buildReceiptHtml({
        restaurantName: printSettings.restaurantName || tenant.name || 'ŞefPOS',
        restaurantPhone: printSettings.restaurantPhone,
        restaurantAddress: printSettings.restaurantAddress,
        tableLabel: order.table_label || '—',
        orderNumber: order.order_number || order.id.slice(0, 8),
        items: rows.map((r) => ({
          productName: r.product_name || '',
          variantName: r.variant_name || null,
          quantity: r.quantity,
          unitPrice: r.unit_price,
          totalAmount: r.total_amount,
          notes: r.notes || null,
        })),
        subtotal,
        taxAmount: tax,
        discountAmount: discount,
        total,
        paymentMethod: order.payment_method || undefined,
        footer: printSettings.receiptFooter,
        printStyle: printSettings.printStyle,
      });

      const result = await printToAdisyonPrinter(printSettings, html, {
        title: `Adisyon yeniden yazdırıldı (#${order.order_number || ''})`,
      });
      if (!result.success) {
        dispatchPrintToast({
          kind: 'error',
          message: 'Adisyon yazdırılamadı',
          detail: result.error,
        });
      }
    } finally {
      setPrintingId(null);
    }
  };

  const fmtTime = (iso: string) => {
    try {
      const d = new Date(iso);
      return (
        d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' }) +
        ' ' +
        d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
      );
    } catch {
      return iso;
    }
  };

  const statusBadge = (s: string | null) => {
    const map: Record<string, { text: string; cls: string }> = {
      completed: { text: 'Ödendi', cls: 'bg-green-100 text-green-700 border-green-200' },
      open: { text: 'Açık', cls: 'bg-amber-100 text-amber-700 border-amber-200' },
      partial: { text: 'Kısmi', cls: 'bg-blue-100 text-blue-700 border-blue-200' },
      cancelled: { text: 'İptal', cls: 'bg-red-100 text-red-700 border-red-200' },
    };
    const v = map[s || ''] || { text: s || '—', cls: 'bg-slate-100 text-slate-600 border-slate-200' };
    return (
      <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-bold ${v.cls}`}>
        {v.text}
      </span>
    );
  };

  return (
    <div className="fixed inset-0 z-[80] bg-black/50 flex items-stretch md:items-center justify-center p-0 md:p-4">
      <div className="bg-white w-full md:max-w-3xl md:rounded-2xl shadow-2xl flex flex-col max-h-screen md:max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-gradient-to-r from-orange-500 to-red-500 text-white">
          <div className="flex items-center gap-2 min-w-0">
            <Receipt className="w-5 h-5 shrink-0" />
            <div className="min-w-0">
              <h3 className="font-bold text-base truncate">Geçmiş adisyonlar</h3>
              <p className="text-xs opacity-90 truncate">
                {filterTableNumber != null
                  ? `Masa ${filterTableNumber} — kapanmış siparişleri yeniden yazdır`
                  : 'Kapanmış siparişlerin adisyonunu yeniden yazdır'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-white/20 rounded-lg active:scale-95"
            aria-label="Kapat"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Calendar className="w-4 h-4 text-slate-500" />
            {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all active:scale-95 ${
                  period === p
                    ? 'bg-orange-500 text-white border-orange-500'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-orange-300'
                }`}
              >
                {PERIOD_LABELS[p]}
              </button>
            ))}
            <button
              onClick={load}
              className="ml-auto p-1.5 rounded-lg bg-white border border-slate-200 hover:border-orange-300 active:scale-95"
              title="Yenile"
            >
              <RefreshCw className={`w-4 h-4 text-slate-600 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Sipariş no, masa no veya ödeme ile ara…"
              className="w-full pl-8 pr-3 py-2 rounded-lg border border-slate-200 text-sm focus:border-orange-400 focus:outline-none"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-2">
          {loading && filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-slate-400 py-12 gap-2">
              <RefreshCw className="w-6 h-6 animate-spin" />
              <span className="text-sm">Yükleniyor…</span>
            </div>
          ) : fetchError ? (
            <div className="flex flex-col items-center justify-center text-red-600 py-12 gap-2 px-4 text-center">
              <Receipt className="w-8 h-8" />
              <span className="text-sm font-semibold">Liste yüklenemedi</span>
              <span className="text-xs text-red-500">{fetchError}</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-slate-400 py-12 gap-2 px-4 text-center">
              <Receipt className="w-8 h-8" />
              <span className="text-sm font-semibold">Bu dönemde sipariş yok</span>
              <span className="text-xs">
                Üstten &quot;Son 7 gün&quot; veya &quot;Son 30 gün&quot; seçip yenileyin.
              </span>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {filtered.map((o) => (
                <li
                  key={o.id}
                  className="flex items-center gap-2 py-2.5 px-1 hover:bg-slate-50 rounded-lg"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-slate-800 text-sm">
                        {o.table_label}
                      </span>
                      {o.order_number && (
                        <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full font-mono">
                          #{o.order_number}
                        </span>
                      )}
                      {statusBadge(o.status)}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-2">
                      <span>{fmtTime(o.created_at)}</span>
                      <span className="font-bold text-slate-700">
                        {(o.total_amount ?? 0).toFixed(2)} ₺
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => handlePrint(o)}
                    disabled={printingId === o.id}
                    className="px-3 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-1.5 active:scale-95"
                  >
                    {printingId === o.id ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Printer className="w-3.5 h-3.5" />
                    )}
                    Yazdır
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50 text-[11px] text-slate-500 flex items-center gap-2">
          <Printer className="w-3.5 h-3.5" />
          Adisyon, Ayarlar → Yazıcılar'da seçilen "Adisyon yazıcısı"na gönderilir.
        </div>
      </div>
    </div>
  );
}
