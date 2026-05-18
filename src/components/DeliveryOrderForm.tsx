import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
  Bike, User, MapPin, FileText, Clock, ChevronLeft, Plus, Minus,
  Search, X, Trash2, Home, ShoppingBag, CreditCard, Banknote, Smartphone,
  History, RefreshCw, Check, ChevronRight
} from 'lucide-react';
import { Courier, DeliveryCustomer } from './TakeawayOrders';
import { loadPrintSettings, printTakeawayReceipt } from '../lib/printService';
import { notifyHemenYolda } from '../lib/hemenyoldaApi';

/** Cari hesap (customers tablosu) — paket formunda teslimat kaydı ile birlikte aranır */
interface CariCustomerRow {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  is_active: boolean;
}

type CustomerSuggestion =
  | { kind: 'delivery'; row: DeliveryCustomer }
  | { kind: 'cari'; row: CariCustomerRow };

type Category = { id: string; name: string; sort_order: number };
type Product = { id: string; name: string; price: number; category_id: string | null; tax_rate?: number | null };
interface CartItem { product: Product; quantity: number; note: string }

type OrderSubtype = 'takeaway' | 'gel_al' | 'delivery';

interface DeliveryOrderFormProps {
  couriers: Courier[];
  editOrder?: any | null;
  /** Caller ID akışından gelen önyükleme: telefonu yaz, varsa müşteriyi seç. */
  prefillCustomer?: { phone: string; matched: DeliveryCustomer | null } | null;
  onClose: () => void;
}

export function DeliveryOrderForm({ couriers, editOrder, prefillCustomer, onClose }: DeliveryOrderFormProps) {
  const { tenant, user, profile, activeBranch } = useAuth();

  const [subtype, setSubtype] = useState<OrderSubtype>(editOrder?.order_type === 'delivery' ? 'delivery' : editOrder?.order_subtype === 'gel_al' ? 'gel_al' : 'takeaway');
  const [customerPhone, setCustomerPhone] = useState(editOrder?.customer_phone || '');
  const [customerName, setCustomerName] = useState(editOrder?.customer_name || '');
  const [deliveryAddress, setDeliveryAddress] = useState(editOrder?.delivery_address || '');
  const [deliveryNote, setDeliveryNote] = useState(editOrder?.delivery_note || '');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'online'>(editOrder?.payment_method || 'cash');
  const [paymentCollected, setPaymentCollected] = useState<boolean>(editOrder?.payment_collected ?? false);
  const [estimatedMinutes, setEstimatedMinutes] = useState(String(editOrder?.estimated_delivery_minutes || 30));
  const [assignCourierId, setAssignCourierId] = useState(editOrder?.courier_id || '');

  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [customerSuggestions, setCustomerSuggestions] = useState<CustomerSuggestion[]>([]);
  const [selectedDeliveryCustomer, setSelectedDeliveryCustomer] = useState<DeliveryCustomer | null>(null);
  const [selectedCariCustomer, setSelectedCariCustomer] = useState<CariCustomerRow | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [lastOrders, setLastOrders] = useState<any[]>([]);
  const [showLastOrders, setShowLastOrders] = useState(false);
  const [loadingCustomer, setLoadingCustomer] = useState(false);
  const phoneDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const customerSearchRef = useRef<HTMLDivElement | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  const availableCouriers = couriers.filter(c => c.status === 'available');
  const isDelivery = subtype === 'delivery';

  useEffect(() => {
    if (!tenant) return;
    void supabase
      .from('categories')
      .select('id, name, sort_order')
      .eq('tenant_id', tenant.id)
      .order('sort_order')
      .then(({ data, error }) => {
        if (error) console.error('[Paket] kategoriler:', error);
        if (data) setCategories(data);
      });
    void supabase
      .from('products')
      .select('id, name, price, category_id, tax_rate')
      .eq('tenant_id', tenant.id)
      .eq('is_active', true)
      .order('name')
      .then(({ data, error }) => {
        if (error) console.error('[Paket] ürünler:', error);
        if (data) setProducts(data as Product[]);
      });
  }, [tenant]);

  useEffect(() => {
    if (editOrder?.order_items) {
      const mapped: CartItem[] = editOrder.order_items.map((i: any) => ({
        product: { id: i.product_id || i.products?.id, name: i.products?.name || 'Ürün', price: i.unit_price || 0, category_id: null },
        quantity: i.quantity,
        note: i.notes || '',
      }));
      setCart(mapped);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Caller ID önyüklemesi: çağrı geldiğinde telefonu yaz, varsa müşteriyi seç ve son siparişleri çek.
  useEffect(() => {
    if (!prefillCustomer || editOrder) return;
    const { phone, matched } = prefillCustomer;
    if (matched) {
      void selectDeliveryCustomer(matched);
    } else if (phone) {
      setCustomerPhone(phone);
      setCustomerName('');
      setDeliveryAddress('');
      setShowSuggestions(false);
      window.setTimeout(() => nameInputRef.current?.focus(), 150);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillCustomer?.phone, prefillCustomer?.matched?.id]);

  useEffect(() => {
    if (!showSuggestions) return;
    const onPointerDown = (e: PointerEvent) => {
      if (customerSearchRef.current?.contains(e.target as Node)) return;
      setShowSuggestions(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [showSuggestions]);

  const searchCustomers = async (raw: string) => {
    const q = raw.trim();
    if (!tenant || q.length < 2) {
      setCustomerSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    setLoadingCustomer(true);
    const safe = q.replace(/%/g, '').replace(/,/g, ' ').trim();
    const pattern = `%${safe}%`;

    const [byDelPhone, byDelName, byCariName, byCariPhone] = await Promise.all([
      supabase
        .from('delivery_customers')
        .select('*')
        .eq('tenant_id', tenant.id)
        .ilike('phone', pattern)
        .order('last_order_at', { ascending: false })
        .limit(8),
      supabase
        .from('delivery_customers')
        .select('*')
        .eq('tenant_id', tenant.id)
        .ilike('full_name', pattern)
        .order('last_order_at', { ascending: false })
        .limit(8),
      supabase
        .from('customers')
        .select('id, name, phone, email, address, notes, is_active')
        .eq('tenant_id', tenant.id)
        .eq('is_active', true)
        .ilike('name', pattern)
        .order('name', { ascending: true })
        .limit(8),
      supabase
        .from('customers')
        .select('id, name, phone, email, address, notes, is_active')
        .eq('tenant_id', tenant.id)
        .eq('is_active', true)
        .ilike('phone', pattern)
        .order('name', { ascending: true })
        .limit(8),
    ]);

    const err = byDelPhone.error || byDelName.error || byCariName.error || byCariPhone.error;
    if (err) console.error('[Paket] müşteri ara:', err);

    const merged: CustomerSuggestion[] = [];
    const seenDel = new Set<string>();
    const seenCari = new Set<string>();

    for (const row of [...(byDelPhone.data || []), ...(byDelName.data || [])]) {
      const r = row as DeliveryCustomer;
      if (seenDel.has(r.id)) continue;
      seenDel.add(r.id);
      merged.push({ kind: 'delivery', row: r });
    }
    for (const row of [...(byCariName.data || []), ...(byCariPhone.data || [])]) {
      const r = row as CariCustomerRow;
      if (seenCari.has(r.id)) continue;
      seenCari.add(r.id);
      merged.push({ kind: 'cari', row: r });
    }

    setCustomerSuggestions(merged);
    setShowSuggestions(merged.length > 0);
    setLoadingCustomer(false);
  };

  const handleCustomerSearchChange = (val: string) => {
    setCustomerPhone(val);
    setSelectedDeliveryCustomer(null);
    setSelectedCariCustomer(null);
    if (phoneDebounce.current) clearTimeout(phoneDebounce.current);
    phoneDebounce.current = setTimeout(() => searchCustomers(val), 300);
  };

  const loadLastOrdersForDeliveryCustomer = async (customer: DeliveryCustomer) => {
    const { data } = await supabase
      .from('orders')
      .select('*, order_items(quantity, unit_price, products(name))')
      .eq('delivery_customer_id', customer.id)
      .order('created_at', { ascending: false })
      .limit(3);
    if (data) setLastOrders(data);
  };

  const loadLastOrdersForCari = async (cari: CariCustomerRow) => {
    const { data: byId } = await supabase
      .from('orders')
      .select('*, order_items(quantity, unit_price, products(name))')
      .eq('tenant_id', tenant.id)
      .eq('customer_id', cari.id)
      .in('order_type', ['takeaway', 'delivery'])
      .order('created_at', { ascending: false })
      .limit(3);
    let data = byId;
    if ((!data || data.length === 0) && cari.phone?.trim()) {
      const p = cari.phone.trim().replace(/%/g, '');
      const { data: byPhone } = await supabase
        .from('orders')
        .select('*, order_items(quantity, unit_price, products(name))')
        .eq('tenant_id', tenant.id)
        .in('order_type', ['takeaway', 'delivery'])
        .ilike('customer_phone', `%${p}%`)
        .order('created_at', { ascending: false })
        .limit(3);
      data = byPhone;
    }
    if (data) setLastOrders(data);
  };

  const selectDeliveryCustomer = async (customer: DeliveryCustomer) => {
    setSelectedDeliveryCustomer(customer);
    setSelectedCariCustomer(null);
    setCustomerPhone(customer.phone);
    setCustomerName(customer.full_name);
    setDeliveryAddress(customer.address || '');
    setShowSuggestions(false);
    await loadLastOrdersForDeliveryCustomer(customer);
  };

  const selectCariCustomer = async (cari: CariCustomerRow) => {
    setSelectedCariCustomer(cari);
    setSelectedDeliveryCustomer(null);
    setCustomerPhone(cari.phone?.trim() || '');
    setCustomerName(cari.name);
    setDeliveryAddress(cari.address || '');
    setShowSuggestions(false);
    await loadLastOrdersForCari(cari);
  };

  const pickSuggestion = (s: CustomerSuggestion) => {
    if (s.kind === 'delivery') void selectDeliveryCustomer(s.row);
    else void selectCariCustomer(s.row);
  };

  const reorderFromHistory = (order: any) => {
    if (!order.order_items) return;
    setCart(order.order_items.map((i: any) => ({
      product: {
        id: i.product_id || '',
        name: i.products?.name || 'Ürün',
        price: i.unit_price || 0,
        category_id: null
      },
      quantity: i.quantity,
      note: '',
    })));
    setShowLastOrders(false);
  };

  const filteredProducts = products.filter(p => {
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase());
    const matchCat = !selectedCategory || p.category_id === selectedCategory;
    return matchSearch && matchCat;
  });

  const addToCart = (product: Product) => {
    setCart(prev => {
      const existing = prev.find(i => i.product.id === product.id);
      if (existing) return prev.map(i => i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { product, quantity: 1, note: '' }];
    });
  };

  const updateQty = (productId: string, delta: number) => {
    setCart(prev => {
      const item = prev.find(i => i.product.id === productId);
      if (!item) return prev;
      const newQty = item.quantity + delta;
      if (newQty <= 0) return prev.filter(i => i.product.id !== productId);
      return prev.map(i => i.product.id === productId ? { ...i, quantity: newQty } : i);
    });
  };

  const updateNote = (productId: string, note: string) => {
    setCart(prev => prev.map(i => i.product.id === productId ? { ...i, note } : i));
  };

  const cartTotal = cart.reduce((s, i) => s + i.product.price * i.quantity, 0);

  const upsertCustomer = async (): Promise<string | null> => {
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

    const { data: created } = await supabase.from('delivery_customers').insert({
      tenant_id: tenant.id,
      branch_id: activeBranch?.id || null,
      full_name: customerName.trim(),
      phone: customerPhone.trim(),
      address: deliveryAddress.trim(),
      last_order_at: new Date().toISOString(),
      order_count: 1,
    }).select('id').single();
    return created?.id || null;
  };

  const handleSubmit = async () => {
    if (!tenant || !user) return;
    if (!customerName.trim()) { alert('Müşteri adı zorunludur'); return; }
    if (!customerPhone.trim()) { alert('Telefon zorunludur'); return; }
    if (!deliveryAddress.trim()) { alert('Adres zorunludur'); return; }
    if (cart.length === 0) { alert('En az 1 ürün ekleyin'); return; }
    setSubmitting(true);

    const customerId = await upsertCustomer();
    const courier = assignCourierId ? couriers.find(c => c.id === assignCourierId) : null;

    const orderPayload: Record<string, any> = {
      tenant_id: tenant.id,
      branch_id: activeBranch?.id || null,
      waiter_id: user.id,
      waiter_name: profile?.full_name || '',
      order_type: isDelivery ? 'delivery' : 'takeaway',
      order_subtype: subtype === 'gel_al' ? 'gel_al' : null,
      status: 'active',
      delivery_status: 'pending',
      customer_name: customerName.trim(),
      customer_phone: customerPhone.trim() || null,
      delivery_address: deliveryAddress.trim() || null,
      delivery_note: deliveryNote.trim() || null,
      payment_method: paymentMethod,
      payment_collected: paymentCollected,
      payment_status: paymentCollected ? 'paid' : 'unpaid',
      estimated_delivery_minutes: isDelivery ? parseInt(estimatedMinutes) || 30 : null,
      courier_id: courier?.id || null,
      courier_name: courier?.full_name || null,
      delivery_customer_id: customerId,
      subtotal: cartTotal,
      total_amount: cartTotal,
    };

    if (courier) {
      orderPayload.delivery_status = 'on_the_way';
      orderPayload.assigned_at = new Date().toISOString();
      orderPayload.picked_up_at = new Date().toISOString();
    }

    let orderId: string;

    if (editOrder) {
      const { data: updated } = await supabase.from('orders').update(orderPayload).eq('id', editOrder.id).select('id').single();
      if (!updated) { setSubmitting(false); return; }
      orderId = updated.id;
      await supabase.from('order_items').delete().eq('order_id', orderId);
    } else {
      const { data: created, error } = await supabase.from('orders').insert(orderPayload).select('id, order_number').single();
      if (error || !created) { alert('Hata: ' + error?.message); setSubmitting(false); return; }
      orderId = created.id;
    }

    const items = cart.map((i) => {
      const lineTotal = i.product.price * i.quantity;
      return {
        order_id: orderId,
        tenant_id: tenant.id,
        product_id: i.product.id,
        quantity: i.quantity,
        unit_price: i.product.price,
        subtotal: lineTotal,
        total_amount: lineTotal,
        tax_rate: i.product.tax_rate ?? 20,
        discount_amount: 0,
        notes: i.note || null,
      };
    });
    await supabase.from('order_items').insert(items);

    if (courier) await supabase.from('couriers').update({ status: 'busy' }).eq('id', courier.id);

    if (!editOrder) {
      const printSettings = loadPrintSettings();
      if ((printSettings as any).autoPrintTakeaway !== false) {
        printTakeawayReceipt({
          settings: printSettings,
          orderType: isDelivery ? 'delivery' : 'takeaway',
          orderNumber: '',
          customerName: customerName.trim(),
          customerPhone: customerPhone.trim(),
          // Adres her durumda fişe basılır — paket / gel-al / kurye fark etmez.
          // Müşteri adres yazdıysa termal fişte "MUSTERI ADRESI" kutusunda görünür.
          deliveryAddress: deliveryAddress.trim(),
          deliveryNote: deliveryNote.trim(),
          courierName: courier?.full_name,
          estimatedMinutes: isDelivery ? parseInt(estimatedMinutes) || 30 : 0,
          items: cart.map(i => ({
            productName: i.product.name,
            quantity: i.quantity,
            unitPrice: i.product.price,
            totalAmount: i.product.price * i.quantity,
            notes: i.note || null,
          })),
          subtotal: cartTotal,
          total: cartTotal,
        });
      }
    }

    if (subtype !== 'gel_al') {
      notifyHemenYolda(orderId, editOrder ? 'update' : 'new', activeBranch?.id ?? null);
    }

    setSubmitting(false);
    onClose();
  };

  const SUBTYPES: { key: OrderSubtype; label: string; icon: any; color: string; active: string }[] = [
    { key: 'takeaway', label: 'Paket', icon: ShoppingBag, color: 'text-orange-600', active: 'bg-orange-500 text-white' },
    { key: 'gel_al',   label: 'Gel-Al', icon: Home,      color: 'text-teal-600',   active: 'bg-teal-500 text-white' },
    { key: 'delivery', label: 'Kurye',  icon: Bike,      color: 'text-blue-600',   active: 'bg-blue-500 text-white' },
  ];

  return (
    <div className="h-full flex flex-col bg-slate-50">
      <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3 shrink-0">
        <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl transition">
          <ChevronLeft className="w-5 h-5 text-slate-600" />
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-black text-slate-800">{editOrder ? 'Sipariş Düzenle' : 'Yeni Sipariş'}</h1>
          <p className="text-xs text-slate-500">Müşteri bilgilerini girin ve ürünleri ekleyin</p>
        </div>
        {cart.length > 0 && (
          <div className="bg-orange-500 text-white rounded-xl px-3 py-1.5 text-sm font-black">
            {cartTotal.toFixed(2)}₺
          </div>
        )}
      </div>

      <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
        <div className="lg:w-80 xl:w-96 bg-white border-b lg:border-b-0 lg:border-r border-slate-200 flex flex-col shrink-0 overflow-y-auto">
          <div className="p-4 space-y-4">
            <div className="flex gap-1.5">
              {SUBTYPES.map(s => {
                const Icon = s.icon;
                return (
                  <button
                    key={s.key}
                    onClick={() => setSubtype(s.key)}
                    className={`flex-1 flex flex-col items-center gap-1 py-2.5 rounded-xl text-xs font-bold transition active:scale-95 ${subtype === s.key ? s.active : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                  >
                    <Icon className="w-4 h-4" />
                    {s.label}
                  </button>
                );
              })}
            </div>

            <div className="relative" ref={customerSearchRef}>
              <label className="text-xs font-bold text-slate-600 mb-1 block">Müşteri ara (cari adı, teslimat kaydı veya telefon)</label>
              <p className="text-[11px] text-slate-500 mb-1.5">
                Üst kutu arama içindir. Müşteri adını <strong>aşağıdaki «Ad Soyad»</strong> alanına yazın.
              </p>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={customerPhone}
                  onChange={(e) => handleCustomerSearchChange(e.target.value)}
                  onFocus={() => customerSuggestions.length > 0 && setShowSuggestions(true)}
                  placeholder="Cari adı, isim veya 05XX…"
                  className="w-full pl-9 pr-8 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-orange-400 focus:border-transparent"
                />
                {loadingCustomer && <div className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />}
                {(selectedDeliveryCustomer || selectedCariCustomer) && (
                  <Check className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-green-500" />
                )}
              </div>

              {showSuggestions && customerSuggestions.length > 0 && (
                <div className="absolute z-30 top-full mt-1 left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden max-h-48 overflow-y-auto">
                  <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-100">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Eşleşen kayıtlar</p>
                  </div>
                  {customerSuggestions.map((s) => {
                    const key = s.kind === 'delivery' ? `d-${s.row.id}` : `c-${s.row.id}`;
                    if (s.kind === 'delivery') {
                      const c = s.row;
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => pickSuggestion(s)}
                          className="w-full text-left px-3 py-2.5 hover:bg-orange-50 border-b border-slate-100 last:border-b-0 transition"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-orange-100 text-orange-700 uppercase">Teslimat</span>
                                <div className="font-bold text-sm text-slate-800">{c.full_name}</div>
                              </div>
                              <div className="text-xs text-slate-500">{c.phone}</div>
                              {c.address && (
                                <div className="text-xs text-slate-400 mt-0.5 truncate flex items-center gap-1">
                                  <MapPin className="w-2.5 h-2.5 shrink-0" />
                                  {c.address}
                                </div>
                              )}
                            </div>
                            <div className="text-xs text-orange-500 font-bold shrink-0">{c.order_count} sipariş</div>
                          </div>
                        </button>
                      );
                    }
                    const c = s.row;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => pickSuggestion(s)}
                        className="w-full text-left px-3 py-2.5 hover:bg-teal-50 border-b border-slate-100 last:border-b-0 transition"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-teal-100 text-teal-800 uppercase">Cari</span>
                              <div className="font-bold text-sm text-slate-800">{c.name}</div>
                            </div>
                            <div className="text-xs text-slate-500">{c.phone || '—'}</div>
                            {c.address && (
                              <div className="text-xs text-slate-400 mt-0.5 truncate flex items-center gap-1">
                                <MapPin className="w-2.5 h-2.5 shrink-0" />
                                {c.address}
                              </div>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="relative z-10">
              <label className="text-xs font-bold text-slate-600 mb-1 block">Ad Soyad *</label>
              <input
                ref={nameInputRef}
                type="text"
                value={customerName}
                onChange={e => setCustomerName(e.target.value)}
                onFocus={() => setShowSuggestions(false)}
                placeholder="Örn. Ahmet Yılmaz"
                autoComplete="name"
                className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-orange-400 focus:border-transparent bg-white"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-600 mb-1 block">
                Adres <span className="text-red-500">*</span>
              </label>
              <textarea
                value={deliveryAddress}
                onChange={e => setDeliveryAddress(e.target.value)}
                placeholder="Mahalle, sokak, bina, daire..."
                rows={2}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-orange-400 focus:border-transparent resize-none"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-600 mb-1 block">Not</label>
              <input
                type="text"
                value={deliveryNote}
                onChange={e => setDeliveryNote(e.target.value)}
                placeholder="Acı olmasın, ek ketçap..."
                className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-orange-400 focus:border-transparent"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-600 mb-1.5 block">Ödeme Yöntemi</label>
              <div className="flex gap-1.5">
                {([['cash', 'Nakit', Banknote], ['card', 'Kart', CreditCard], ['online', 'Online', Smartphone]] as [string, string, any][]).map(([v, l, Icon]) => (
                  <button
                    key={v}
                    onClick={() => setPaymentMethod(v as any)}
                    className={`flex-1 flex flex-col items-center gap-1 py-2 rounded-xl text-xs font-bold transition ${paymentMethod === v ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {l}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-600 mb-1.5 block">Ödeme Durumu</label>
              <div className="flex gap-1.5">
                <button
                  onClick={() => setPaymentCollected(false)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold transition ${!paymentCollected ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                >
                  <Banknote className="w-3.5 h-3.5" />
                  {paymentMethod === 'cash' ? 'Kapıda Nakit' : paymentMethod === 'card' ? 'Kapıda Kart' : 'Kapıda Ödenecek'}
                </button>
                <button
                  onClick={() => setPaymentCollected(true)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold transition ${paymentCollected ? 'bg-green-500 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                >
                  <Check className="w-3.5 h-3.5" />
                  Ödendi
                </button>
              </div>
            </div>

            {isDelivery && (
              <div className="space-y-2">
                <div>
                  <label className="text-xs font-bold text-slate-600 mb-1 block flex items-center gap-1">
                    <Clock className="w-3 h-3" /> Tahmini Süre
                  </label>
                  <div className="flex gap-1.5">
                    {[15, 30, 45, 60].map(m => (
                      <button
                        key={m}
                        onClick={() => setEstimatedMinutes(String(m))}
                        className={`flex-1 py-2 rounded-xl text-xs font-bold transition ${estimatedMinutes === String(m) ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                      >
                        {m}dk
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-600 mb-1 block">Kurye (Opsiyonel)</label>
                  <select
                    value={assignCourierId}
                    onChange={e => setAssignCourierId(e.target.value)}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                  >
                    <option value="">Sonradan ata</option>
                    {availableCouriers.map(c => (
                      <option key={c.id} value={c.id}>{c.full_name} {c.phone && `· ${c.phone}`}</option>
                    ))}
                  </select>
                  {availableCouriers.length === 0 && (
                    <p className="text-xs text-amber-600 mt-1">Müsait kurye yok</p>
                  )}
                </div>
              </div>
            )}

            {lastOrders.length > 0 && (
              <div>
                <button
                  onClick={() => setShowLastOrders(!showLastOrders)}
                  className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 transition"
                >
                  <History className="w-3.5 h-3.5" />
                  Son Siparişler ({lastOrders.length})
                  <ChevronRight className={`w-3.5 h-3.5 transition ${showLastOrders ? 'rotate-90' : ''}`} />
                </button>
                {showLastOrders && (
                  <div className="mt-2 space-y-2">
                    {lastOrders.map((o, idx) => {
                      const total = (o.order_items || []).reduce((s: number, i: any) => s + (i.unit_price || 0) * i.quantity, 0);
                      return (
                        <div key={o.id} className="bg-slate-50 rounded-xl p-2.5 border border-slate-200">
                          <div className="flex items-start justify-between gap-2 mb-1.5">
                            <div className="text-xs text-slate-500">{new Date(o.created_at).toLocaleDateString('tr-TR')}</div>
                            <div className="text-xs font-black text-slate-700">{total.toFixed(2)}₺</div>
                          </div>
                          <div className="text-xs text-slate-600 mb-2 space-y-0.5">
                            {(o.order_items || []).slice(0, 3).map((item: any, i: number) => (
                              <div key={i}>{item.quantity}x {item.products?.name || 'Ürün'}</div>
                            ))}
                          </div>
                          <button
                            onClick={() => reorderFromHistory(o)}
                            className="w-full py-1.5 bg-orange-500 text-white rounded-lg text-xs font-bold transition active:scale-95"
                          >
                            Tekrar Sipariş Ver
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col">
          <div className="border-b bg-white p-3 space-y-2 shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Ürün ara..."
                className="w-full pl-9 pr-8 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
              />
              {search && <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"><X className="w-4 h-4" /></button>}
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide">
              <button
                onClick={() => setSelectedCategory(null)}
                className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold transition ${!selectedCategory ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                Tümü
              </button>
              {categories.map(c => (
                <button
                  key={c.id}
                  onClick={() => setSelectedCategory(c.id)}
                  className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold transition ${selectedCategory === c.id ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
            <div className="flex-1 overflow-y-auto p-3">
              {filteredProducts.length === 0 ? (
                <div className="flex items-center justify-center h-32 text-slate-400 text-sm">Ürün bulunamadı</div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-2 lg:grid-cols-3 gap-2">
                  {filteredProducts.map(p => {
                    const inCart = cart.find(i => i.product.id === p.id);
                    return (
                      <button
                        key={p.id}
                        onClick={() => addToCart(p)}
                        className={`relative bg-white border-2 rounded-xl p-3 text-left transition active:scale-95 group ${inCart ? 'border-orange-400 shadow-md' : 'border-slate-200 hover:border-orange-300 hover:shadow'}`}
                      >
                        {inCart && (
                          <div className="absolute -top-2 -right-2 w-5 h-5 bg-orange-500 text-white rounded-full flex items-center justify-center text-xs font-black">
                            {inCart.quantity}
                          </div>
                        )}
                        <div className="font-bold text-sm text-slate-800 line-clamp-2 group-hover:text-orange-600">{p.name}</div>
                        <div className="text-orange-600 font-black text-base mt-1">{p.price.toFixed(2)}₺</div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="w-full md:w-64 lg:w-72 border-t md:border-t-0 md:border-l bg-white flex flex-col max-h-96 md:max-h-full">
              <div className="p-3 border-b flex items-center justify-between">
                <span className="font-bold text-slate-700 text-sm">Sepet</span>
                {cart.length > 0 && (
                  <button onClick={() => setCart([])} className="text-xs text-red-400 hover:text-red-600">Temizle</button>
                )}
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
                {cart.map(item => (
                  <div key={item.product.id} className="bg-slate-50 rounded-xl p-2.5 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold text-slate-700 truncate">{item.product.name}</div>
                        <div className="text-xs font-black text-orange-600">{(item.product.price * item.quantity).toFixed(2)}₺</div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => updateQty(item.product.id, -1)} className="w-6 h-6 bg-slate-200 hover:bg-slate-300 rounded-lg flex items-center justify-center transition">
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="w-5 text-center text-xs font-black">{item.quantity}</span>
                        <button onClick={() => updateQty(item.product.id, 1)} className="w-6 h-6 bg-orange-500 hover:bg-orange-600 text-white rounded-lg flex items-center justify-center transition">
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                    <input
                      type="text"
                      value={item.note}
                      onChange={e => updateNote(item.product.id, e.target.value)}
                      placeholder="Not ekle..."
                      className="w-full px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-orange-300"
                    />
                  </div>
                ))}
                {cart.length === 0 && (
                  <div className="text-center py-8 text-slate-400 text-xs">Ürün eklenmedi</div>
                )}
              </div>
              <div className="p-3 border-t">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-semibold text-slate-600">Toplam</span>
                  <span className="text-xl font-black text-orange-600">{cartTotal.toFixed(2)}₺</span>
                </div>
                <button
                  onClick={handleSubmit}
                  disabled={submitting || cart.length === 0}
                  className="w-full py-3 bg-gradient-to-r from-orange-500 to-red-600 text-white font-bold rounded-xl transition active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2 shadow-md"
                >
                  {submitting ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  {editOrder ? 'Güncelle' : 'Siparişi Oluştur'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
