import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { CartItem } from '../types/posOrder';
import type { OrderItemWithProduct } from '../lib/orderOptimistic';
import { isTempLineId, isTempOrderId } from '../lib/orderOptimistic';
import { takeWarmOrderItems } from '../lib/orderPanelWarm';
import { requestHybridSync } from '../lib/hybridMode';
import type { Database } from '../lib/supabase';
import { X, Package, ShoppingBag, Home, Bike, User, Phone, MapPin, Clock, Loader2 } from 'lucide-react';

type Order = Database['public']['Tables']['orders']['Row'];

type Subtype = 'takeaway' | 'gel_al' | 'delivery';

interface CourierRow {
  id: string;
  full_name: string;
  phone: string;
  status: string;
}

interface TableToPackageTransferModalProps {
  tableId: string;
  branchId: string | null;
  currentOrder: Order | null;
  existingOrderItems: OrderItemWithProduct[];
  cart: CartItem[];
  totalPaid: number;
  onClose: () => void;
  onTransferred: () => void;
  emitTableStateChanged: (detail: Record<string, unknown> & { id: string }) => void;
}

export function TableToPackageTransferModal({
  tableId,
  branchId,
  currentOrder,
  existingOrderItems,
  cart,
  totalPaid,
  onClose,
  onTransferred,
  emitTableStateChanged,
}: TableToPackageTransferModalProps) {
  const { tenant, user, profile, activeBranch } = useAuth();
  const [subtype, setSubtype] = useState<Subtype>('takeaway');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryNote, setDeliveryNote] = useState('');
  const [couriers, setCouriers] = useState<CourierRow[]>([]);
  const [assignCourierId, setAssignCourierId] = useState('');
  const [estimatedMinutes, setEstimatedMinutes] = useState('30');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const isDelivery = subtype === 'delivery';
  const availableCouriers = couriers.filter((c) => c.status === 'available');

  useEffect(() => {
    if (!tenant) return;
    let q = supabase.from('couriers').select('id, full_name, phone, status').eq('tenant_id', tenant.id).eq('is_active', true).order('full_name');
    if (activeBranch) q = q.or(`branch_id.eq.${activeBranch.id},branch_id.is.null`);
    void q.then(({ data }) => {
      if (data) setCouriers(data as CourierRow[]);
    });
  }, [tenant, activeBranch]);

  const upsertDeliveryCustomer = async (): Promise<string | null> => {
    if (!tenant || !customerPhone.trim()) return null;
    const { data: existing } = await supabase
      .from('delivery_customers')
      .select('id')
      .eq('tenant_id', tenant.id)
      .eq('phone', customerPhone.trim())
      .maybeSingle();
    if (existing) {
      await supabase
        .from('delivery_customers')
        .update({
          full_name: customerName.trim(),
          address: deliveryAddress.trim(),
          last_order_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
      return existing.id;
    }
    const { data: created } = await supabase
      .from('delivery_customers')
      .insert({
        tenant_id: tenant.id,
        branch_id: activeBranch?.id || null,
        full_name: customerName.trim(),
        phone: customerPhone.trim(),
        address: deliveryAddress.trim(),
        last_order_at: new Date().toISOString(),
        order_count: 1,
      })
      .select('id')
      .single();
    return created?.id || null;
  };

  const buildLinePayloads = () => {
    if (!tenant) return [];
    const rows: Array<{
      tenant_id: string;
      product_id: string;
      variant_id: string | null;
      variant_name: string | null;
      quantity: number;
      unit_price: number;
      subtotal: number;
      tax_rate: number;
      discount_amount: number;
      total_amount: number;
      notes: string | null;
    }> = [];

    for (const i of existingOrderItems) {
      if (isTempLineId(i.id)) continue;
      const lineTot = Number(i.total_amount ?? i.subtotal ?? 0);
      rows.push({
        tenant_id: tenant.id,
        product_id: i.product_id,
        variant_id: i.variant_id,
        variant_name: i.variant_name,
        quantity: i.quantity,
        unit_price: Number(i.unit_price),
        subtotal: lineTot,
        tax_rate: Number(i.tax_rate ?? 20),
        discount_amount: Number(i.discount_amount ?? 0),
        total_amount: lineTot,
        notes: i.notes,
      });
    }

    for (const item of cart) {
      const finalPrice =
        item.weightedPrice !== undefined && item.quantity > 0
          ? item.weightedPrice / item.quantity
          : item.product.price + (item.variant ? item.variant.price_modifier : 0);
      const lineTotal = item.weightedPrice !== undefined ? item.weightedPrice : finalPrice * item.quantity;
      const weightLabel = item.weight ? `${(item.weight / 1000).toFixed(3)} kg` : null;
      rows.push({
        tenant_id: tenant.id,
        product_id: item.product.id,
        variant_id: item.variant?.id || null,
        variant_name: item.variant?.name || (weightLabel ? `Gramaj: ${weightLabel}` : null),
        quantity: item.quantity,
        unit_price: finalPrice,
        subtotal: lineTotal,
        tax_rate: Number(item.product.tax_rate ?? 20),
        discount_amount: 0,
        total_amount: lineTotal,
        notes: item.notes || null,
      });
    }
    return rows;
  };

  const submit = async () => {
    setErr(null);
    if (!tenant || !user) {
      setErr('Oturum bilgisi eksik.');
      return;
    }
    if (!currentOrder?.id || isTempOrderId(currentOrder.id)) {
      setErr('Kayıtlı bir masa siparişi yok.');
      return;
    }
    if (totalPaid > 0.01) {
      setErr('Bu masada ödeme kaydı var; pakete aktaramazsınız. Önce ödemeyi iptal edin veya yeni paket siparişi açın.');
      return;
    }
    if (!customerName.trim()) {
      setErr('Müşteri adı soyadı zorunludur.');
      return;
    }
    if (!customerPhone.trim()) {
      setErr('Telefon zorunludur.');
      return;
    }
    if (!deliveryAddress.trim()) {
      setErr('Adres zorunludur.');
      return;
    }
    const lines = buildLinePayloads();
    if (lines.length === 0) {
      setErr('Sepette veya siparişte aktarılacak ürün yok.');
      return;
    }

    setBusy(true);
    try {
      const subtotal = lines.reduce((s, l) => s + l.total_amount, 0);
      const customerId = await upsertDeliveryCustomer();
      const courier = assignCourierId ? couriers.find((c) => c.id === assignCourierId) : null;

      const orderPayload: Record<string, unknown> = {
        tenant_id: tenant.id,
        branch_id: branchId ?? activeBranch?.id ?? null,
        waiter_id: user.id,
        waiter_name: profile?.full_name || '',
        table_id: null,
        order_type: isDelivery ? 'delivery' : 'takeaway',
        order_subtype: subtype === 'gel_al' ? 'gel_al' : null,
        status: 'active',
        delivery_status: 'pending',
        customer_name: customerName.trim(),
        customer_phone: customerPhone.trim(),
        delivery_address: deliveryAddress.trim(),
        delivery_note: deliveryNote.trim() || null,
        payment_method: 'cash',
        payment_collected: false,
        payment_status: 'unpaid',
        estimated_delivery_minutes: isDelivery ? parseInt(estimatedMinutes, 10) || 30 : null,
        courier_id: courier?.id || null,
        courier_name: courier?.full_name || null,
        delivery_customer_id: customerId,
        subtotal,
        tax_amount: 0,
        discount_amount: 0,
        total_amount: subtotal,
      };

      if (courier) {
        orderPayload.delivery_status = 'on_the_way';
        orderPayload.assigned_at = new Date().toISOString();
        orderPayload.picked_up_at = new Date().toISOString();
      }

      const { data: newOrder, error: insErr } = await supabase.from('orders').insert(orderPayload as any).select('id').single();
      if (insErr || !newOrder) throw new Error(insErr?.message || 'Paket siparişi oluşturulamadı.');

      const newId = newOrder.id as string;
      const withOrder = lines.map((l) => ({ ...l, order_id: newId }));
      const { error: itemsErr } = await supabase.from('order_items').insert(withOrder as any);
      if (itemsErr) throw itemsErr;

      if (courier) await supabase.from('couriers').update({ status: 'busy' }).eq('id', courier.id);

      const sourceId = currentOrder.id;
      await supabase.from('order_items').delete().eq('order_id', sourceId);
      await supabase
        .from('orders')
        .update({
          status: 'cancelled',
          completed_at: new Date().toISOString(),
          subtotal: 0,
          tax_amount: 0,
          total_amount: 0,
          payment_status: 'unpaid',
        })
        .eq('id', sourceId);

      await supabase
        .from('restaurant_tables')
        .update({
          status: 'available',
          current_order_id: null,
          session_start: null,
          payment_locked: false,
        })
        .eq('id', tableId);

      emitTableStateChanged({
        id: tableId,
        status: 'available',
        current_order_id: null,
        session_start: null,
        payment_locked: false,
        order: null,
      });
      takeWarmOrderItems(sourceId);
      requestHybridSync(600);
      onTransferred();
    } catch (e: any) {
      setErr(e?.message || 'Aktarım başarısız.');
    } finally {
      setBusy(false);
    }
  };

  const lineCount =
    existingOrderItems.filter((i) => !isTempLineId(i.id)).length + cart.length;

  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/60 p-4" role="presentation" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-orange-500 flex items-center justify-center flex-shrink-0">
              <Package className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-black text-slate-800 truncate">Paket servise aktar</h2>
              <p className="text-xs text-slate-500">{lineCount} kalem masadan paket siparişine taşınır; masa boşalır.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg" aria-label="Kapat">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="flex gap-1.5">
            {(
              [
                { key: 'takeaway' as const, label: 'Paket', Icon: ShoppingBag },
                { key: 'gel_al' as const, label: 'Gel-Al', Icon: Home },
                { key: 'delivery' as const, label: 'Kurye', Icon: Bike },
              ] as const
            ).map(({ key, label, Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setSubtype(key)}
                className={`flex-1 flex flex-col items-center gap-1 py-2 rounded-xl text-xs font-bold transition ${
                  subtype === key ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </div>

          <div>
            <label className="text-xs font-bold text-slate-600 mb-1 block">Ad Soyad *</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-xl text-sm"
                placeholder="Müşteri adı soyadı"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-600 mb-1 block">Telefon *</label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="tel"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-xl text-sm"
                placeholder="05XX XXX XX XX"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-600 mb-1 block">Adres *</label>
            <div className="relative">
              <MapPin className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
              <textarea
                value={deliveryAddress}
                onChange={(e) => setDeliveryAddress(e.target.value)}
                rows={2}
                className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-xl text-sm resize-none"
                placeholder="Mahalle, sokak, bina, daire..."
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-600 mb-1 block">Sipariş notu</label>
            <input
              value={deliveryNote}
              onChange={(e) => setDeliveryNote(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm"
              placeholder="Opsiyonel"
            />
          </div>

          {isDelivery && (
            <>
              <div>
                <label className="text-xs font-bold text-slate-600 mb-1 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Tahmini süre (dk)
                </label>
                <div className="flex gap-1.5">
                  {[15, 30, 45, 60].map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setEstimatedMinutes(String(m))}
                      className={`flex-1 py-2 rounded-xl text-xs font-bold ${
                        estimatedMinutes === String(m) ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600 mb-1 block">Kurye (opsiyonel)</label>
                <select
                  value={assignCourierId}
                  onChange={(e) => setAssignCourierId(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm"
                >
                  <option value="">Sonradan ata</option>
                  {availableCouriers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.full_name}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          {err && <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{err}</div>}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 border border-slate-300 rounded-xl font-bold text-slate-700"
            >
              Vazgeç
            </button>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={busy}
              className="flex-1 py-3 bg-gradient-to-r from-orange-500 to-red-600 text-white rounded-xl font-bold disabled:opacity-50 inline-flex items-center justify-center gap-2"
            >
              {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
              Aktar ve masayı boşalt
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
