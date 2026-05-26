import { useState, useEffect, useRef, useMemo, useCallback, memo, startTransition } from 'react';
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
import { queryCache } from '../lib/queryCache';
import {
  searchTakeawayCustomers,
  type CariCustomerHit,
  type DeliveryCustomerHit,
  type TakeawayCustomerSuggestion,
} from '../lib/takeawayCustomerSearch';
import { sendCourierAssignmentNotification } from '../lib/courierNotification';
import { recordTakeawayPaymentIfNeeded } from '../lib/takeawayPayment';

type CustomerSuggestion = TakeawayCustomerSuggestion;
type CariCustomerRow = CariCustomerHit;
type DeliveryCustomerSearchRow = DeliveryCustomerHit;

type Category = { id: string; name: string; sort_order: number };
type Product = { id: string; name: string; price: number; category_id: string | null; tax_rate?: number | null };
interface CartItem { product: Product; quantity: number; note: string }

type OrderSubtype = 'takeaway' | 'gel_al' | 'delivery';

interface DeliveryOrderFormProps {
  couriers: Courier[];
  editOrder?: any | null;
  /** Caller ID akışından gelen önyükleme: telefonu yaz, varsa müşteriyi seç. */
  prefillCustomer?: { phone: string; matched: DeliveryCustomer | null } | null;
  onClose: (result?: { orderId?: string; reload?: boolean }) => void;
}

function DeliveryOrderFormInner({ couriers, editOrder, prefillCustomer, onClose }: DeliveryOrderFormProps) {
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
  const [fieldError, setFieldError] = useState<'name' | 'phone' | 'address' | 'cart' | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const phoneDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const customerSearchSeq = useRef(0);
  const customerSearchRef = useRef<HTMLDivElement | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const phoneInputRef = useRef<HTMLInputElement | null>(null);
  const addressInputRef = useRef<HTMLTextAreaElement | null>(null);

  const availableCouriers = couriers.filter(c => c.status === 'available');
  const isDelivery = subtype === 'delivery';

  useEffect(() => {
    if (!tenant) return;
    let cancelled = false;
    void queryCache.getProductsAndCategories(tenant.id).then(({ products: prods, categories: cats }) => {
      if (cancelled) return;
      setCategories(
        (cats || [])
          .map((c: { id: string; name: string; sort_order?: number }) => ({
            id: c.id,
            name: c.name,
            sort_order: c.sort_order ?? 0,
          }))
          .sort((a: Category, b: Category) => a.sort_order - b.sort_order),
      );
      setProducts(
        (prods || [])
          .filter((p: { is_active?: boolean | null }) => p.is_active !== false)
          .map((p: { id: string; name: string; price: number; category_id: string | null; tax_rate?: number | null }) => ({
            id: p.id,
            name: p.name,
            price: p.price,
            category_id: p.category_id,
            tax_rate: p.tax_rate,
          }))
          .sort((a: Product, b: Product) => a.name.localeCompare(b.name, 'tr')),
      );
    });
    return () => {
      cancelled = true;
    };
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

  const searchCustomers = useCallback(
    async (raw: string, seq: number) => {
      if (!tenant) return;
      const merged = await searchTakeawayCustomers(tenant.id, raw);
      if (seq !== customerSearchSeq.current) return;
      startTransition(() => {
        setCustomerSuggestions(merged);
        setShowSuggestions(merged.length > 0);
        setLoadingCustomer(false);
      });
    },
    [tenant],
  );

  const focusCustomerField = useCallback((field: 'name' | 'phone' | 'address') => {
    setShowSuggestions(false);
    requestAnimationFrame(() => {
      window.setTimeout(() => {
        if (field === 'name') nameInputRef.current?.focus();
        else if (field === 'phone') phoneInputRef.current?.focus();
        else addressInputRef.current?.focus();
      }, 0);
    });
  }, []);

  const showValidationError = useCallback(
    (field: 'name' | 'phone' | 'address' | 'cart') => {
      setFieldError(field);
      if (field !== 'cart') focusCustomerField(field);
    },
    [focusCustomerField],
  );

  const handleCustomerSearchChange = (val: string) => {
    if (fieldError === 'phone') setFieldError(null);
    setCustomerPhone(val);
    if (phoneDebounce.current) clearTimeout(phoneDebounce.current);
    const q = val.trim();
    if (q.length < 3) {
      startTransition(() => {
        setCustomerSuggestions([]);
        setShowSuggestions(false);
        setLoadingCustomer(false);
      });
      return;
    }
    if (selectedDeliveryCustomer || selectedCariCustomer) {
      setSelectedDeliveryCustomer(null);
      setSelectedCariCustomer(null);
    }
    const seq = ++customerSearchSeq.current;
    phoneDebounce.current = setTimeout(() => {
      startTransition(() => setLoadingCustomer(true));
      void searchCustomers(val, seq);
    }, 420);
  };

  useEffect(() => {
    return () => {
      if (phoneDebounce.current) clearTimeout(phoneDebounce.current);
    };
  }, []);

  const LAST_ORDERS_SELECT =
    'id, created_at, subtotal, total_amount, order_items(quantity, unit_price, products(name))';

  const loadLastOrdersForDeliveryCustomer = async (customer: DeliveryCustomerSearchRow) => {
    const { data } = await supabase
      .from('orders')
      .select(LAST_ORDERS_SELECT)
      .eq('delivery_customer_id', customer.id)
      .order('created_at', { ascending: false })
      .limit(3);
    if (data) setLastOrders(data);
  };

  const loadLastOrdersForCari = async (cari: CariCustomerRow) => {
    if (!tenant) return;
    let data: typeof lastOrders | null = null;
    const base = () =>
      supabase
        .from('orders')
        .select(LAST_ORDERS_SELECT)
        .eq('tenant_id', tenant.id)
        .in('order_type', ['takeaway', 'delivery'])
        .order('created_at', { ascending: false })
        .limit(3);

    if (cari.phone?.trim()) {
      const p = cari.phone.trim().replace(/%/g, '');
      const { data: byPhone } = await base().ilike('customer_phone', `%${p}%`);
      data = byPhone;
    }
    if (!data?.length) {
      const { data: byCariKey } = await base().eq('customer_phone', `cari-${cari.id}`);
      data = byCariKey;
    }
    if (!data?.length && cari.name?.trim()) {
      const { data: byName } = await base().ilike('customer_name', cari.name.trim());
      data = byName;
    }
    if (data) setLastOrders(data);
  };

  const applyDeliveryCustomer = (customer: DeliveryCustomerSearchRow) => {
    setSelectedDeliveryCustomer(customer);
    setSelectedCariCustomer(null);
    setCustomerPhone(customer.phone);
    setCustomerName(customer.full_name);
    setDeliveryAddress(customer.address || '');
    setShowSuggestions(false);
    setLoadingCustomer(false);
  };

  const applyCariCustomer = (cari: CariCustomerRow) => {
    setSelectedCariCustomer(cari);
    setSelectedDeliveryCustomer(null);
    setCustomerPhone(cari.phone?.trim() || '');
    setCustomerName(cari.name);
    setDeliveryAddress(cari.address || '');
    setShowSuggestions(false);
    setLoadingCustomer(false);
  };

  const selectDeliveryCustomer = async (customer: DeliveryCustomerSearchRow) => {
    applyDeliveryCustomer(customer);
    void loadLastOrdersForDeliveryCustomer(customer);
  };

  const selectCariCustomer = async (cari: CariCustomerRow) => {
    applyCariCustomer(cari);
    void loadLastOrdersForCari(cari);
  };

  const pickSuggestion = (s: CustomerSuggestion) => {
    if (s.kind === 'delivery') {
      applyDeliveryCustomer(s.row);
      void loadLastOrdersForDeliveryCustomer(s.row);
    } else {
      applyCariCustomer(s.row);
      void loadLastOrdersForCari(s.row);
    }
  };

  const looksLikePhone = (raw: string) => {
    const digits = raw.replace(/\D/g, '');
    return digits.length >= 7;
  };

  const resolveCustomerFields = () => {
    const phoneRaw = customerPhone.trim();
    let name =
      customerName.trim() ||
      selectedDeliveryCustomer?.full_name?.trim() ||
      selectedCariCustomer?.name?.trim() ||
      '';
    if (!name && phoneRaw && !looksLikePhone(phoneRaw)) {
      name = phoneRaw;
    }
    const phone = phoneRaw || selectedCariCustomer?.phone?.trim() || '';
    let address =
      deliveryAddress.trim() ||
      selectedCariCustomer?.address?.trim() ||
      selectedDeliveryCustomer?.address?.trim() ||
      '';
    if (!address) {
      if (subtype === 'gel_al') address = 'Gel-Al';
      else if (!isDelivery) address = 'Paket Servis';
    }
    return { name, phone, address };
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

  const searchLower = search.trim().toLowerCase();
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchSearch = !searchLower || p.name.toLowerCase().includes(searchLower);
      const matchCat = !selectedCategory || p.category_id === selectedCategory;
      return matchSearch && matchCat;
    });
  }, [products, searchLower, selectedCategory]);

  const cartTotal = useMemo(
    () => cart.reduce((s, i) => s + i.product.price * i.quantity, 0),
    [cart],
  );

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

  /** Telefonsuz cari için dahili anahtar: delivery_customers ile eşleşir. */
  const cariDeliveryPhoneKey = (cari: CariCustomerRow) => `cari-${cari.id}`;

  const upsertDeliveryCustomer = async (
    name: string,
    phone: string,
    address: string,
    cari: CariCustomerRow | null,
  ): Promise<string | null> => {
    if (!tenant) return null;
    const phoneKey = phone.trim() || (cari ? cariDeliveryPhoneKey(cari) : '');
    if (!phoneKey) return null;

    const { data: existing } = await supabase
      .from('delivery_customers')
      .select('id')
      .eq('tenant_id', tenant.id)
      .eq('phone', phoneKey)
      .maybeSingle();

    if (existing) {
      await supabase
        .from('delivery_customers')
        .update({
          full_name: name,
          address: address,
          last_order_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
      return existing.id;
    }

    const { data: created } = await supabase.from('delivery_customers').insert({
      tenant_id: tenant.id,
      branch_id: activeBranch?.id || null,
      full_name: name,
      phone: phoneKey,
      address: address,
      last_order_at: new Date().toISOString(),
      order_count: 1,
    }).select('id').single();
    return created?.id || null;
  };

  const handleSubmit = async () => {
    if (!tenant || !user) return;
    setFieldError(null);
    setSubmitError(null);
    setShowSuggestions(false);
    const { name, phone, address } = resolveCustomerFields();
    if (!name) {
      showValidationError('name');
      return;
    }
    if (!selectedCariCustomer && !phone) {
      showValidationError('phone');
      return;
    }
    if (isDelivery && !deliveryAddress.trim() && !selectedCariCustomer?.address?.trim()) {
      showValidationError('address');
      return;
    }
    if (cart.length === 0) {
      showValidationError('cart');
      return;
    }
    setSubmitting(true);

    try {
    const deliveryCustomerId = await upsertDeliveryCustomer(
      name,
      phone,
      address,
      selectedCariCustomer,
    );
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
      customer_name: name,
      customer_phone: phone || null,
      delivery_address: address || null,
      delivery_note: deliveryNote.trim() || null,
      payment_method: paymentMethod,
      payment_collected: paymentCollected,
      payment_status: paymentCollected ? 'paid' : 'unpaid',
      estimated_delivery_minutes: isDelivery ? parseInt(estimatedMinutes) || 30 : null,
      courier_id: courier?.id || null,
      courier_name: courier?.full_name || null,
      delivery_customer_id: deliveryCustomerId,
      subtotal: cartTotal,
      total_amount: cartTotal,
    };

    if (courier) {
      orderPayload.delivery_status = 'on_the_way';
      orderPayload.assigned_at = new Date().toISOString();
      orderPayload.picked_up_at = new Date().toISOString();
    }

    let orderId: string;
    let savedOrderNumber = editOrder?.order_number || '';

    if (editOrder) {
      const { data: updated } = await supabase.from('orders').update(orderPayload).eq('id', editOrder.id).select('id, order_number').single();
      if (!updated) { setSubmitting(false); return; }
      orderId = updated.id;
      savedOrderNumber = updated.order_number || savedOrderNumber;
      await supabase.from('order_items').delete().eq('order_id', orderId);
    } else {
      const { data: created, error } = await supabase.from('orders').insert(orderPayload).select('id, order_number').single();
      if (error || !created) {
        const msg = error?.message || 'Sipariş kaydedilemedi';
        const friendly = msg.includes('orders_tenant_id_order_number_key') || msg.includes('duplicate key')
          ? 'Sipariş numarası çakıştı. Lütfen «Siparişi Oluştur»a bir kez daha basın.'
          : msg;
        setSubmitError(friendly);
        return;
      }
      orderId = created.id;
      savedOrderNumber = created.order_number || orderId.slice(0, 8).toUpperCase();
      if (courier) {
        await sendCourierAssignmentNotification(
          tenant.id,
          courier.id,
          orderId,
          savedOrderNumber,
          address || null,
        );
      }
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

    if (paymentCollected) {
      await recordTakeawayPaymentIfNeeded({
        tenantId: tenant.id,
        branchId: activeBranch?.id ?? null,
        orderId,
        orderNumber: savedOrderNumber || orderId.slice(0, 8).toUpperCase(),
        orderType: isDelivery ? 'delivery' : 'takeaway',
        orderSubtype: subtype === 'gel_al' ? 'gel_al' : null,
        paymentMethod,
        amount: cartTotal,
        createdBy: user.id,
        shouldRecord: true,
      });
    }

    if (courier) await supabase.from('couriers').update({ status: 'busy' }).eq('id', courier.id);

    if (!editOrder) {
      const printSettings = loadPrintSettings();
      if ((printSettings as any).autoPrintTakeaway !== false) {
        printTakeawayReceipt({
          settings: printSettings,
          orderType: isDelivery ? 'delivery' : 'takeaway',
          orderNumber: '',
          customerName: name,
          customerPhone: phone,
          deliveryAddress: address,
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

    onClose(editOrder ? { reload: true } : { orderId });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Sipariş kaydedilemedi';
      setSubmitError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const SUBTYPES: { key: OrderSubtype; label: string; icon: any; color: string; active: string }[] = [
    { key: 'takeaway', label: 'Paket', icon: ShoppingBag, color: 'text-orange-600', active: 'bg-orange-500 text-white' },
    { key: 'gel_al',   label: 'Gel-Al', icon: Home,      color: 'text-teal-600',   active: 'bg-teal-500 text-white' },
    { key: 'delivery', label: 'Kurye',  icon: Bike,      color: 'text-blue-600',   active: 'bg-blue-500 text-white' },
  ];

  return (
    <div className="h-full flex flex-col bg-slate-50">
      <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3 shrink-0">
        <button type="button" onClick={() => onClose()} className="p-2 hover:bg-slate-100 rounded-xl transition">
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
                  ref={phoneInputRef}
                  type="tel"
                  inputMode="tel"
                  value={customerPhone}
                  onChange={(e) => handleCustomerSearchChange(e.target.value)}
                  onFocus={() => customerSuggestions.length > 0 && setShowSuggestions(true)}
                  placeholder="Cari adı, isim veya 05XX…"
                  autoComplete="off"
                  spellCheck={false}
                  className={`w-full pl-9 pr-8 py-2.5 border rounded-xl text-sm focus:ring-2 focus:ring-orange-400 focus:border-transparent ${
                    fieldError === 'phone' ? 'border-red-400 bg-red-50/50' : 'border-slate-300'
                  }`}
                />
                {loadingCustomer && <div className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />}
                {(selectedDeliveryCustomer || selectedCariCustomer) && (
                  <Check className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-green-500" />
                )}
              </div>

              {fieldError === 'phone' && (
                <p className="mt-1.5 text-xs font-semibold text-red-600" role="alert">
                  Telefon numarası zorunludur.
                </p>
              )}

              {showSuggestions && customerSuggestions.length > 0 && (
                <div className="mt-1 bg-white border border-slate-200 rounded-xl shadow-md overflow-hidden max-h-40 overflow-y-auto">
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

            <div>
              <label className="text-xs font-bold text-slate-600 mb-1 block">Ad Soyad *</label>
              <input
                ref={nameInputRef}
                type="text"
                value={customerName}
                onChange={e => {
                  if (fieldError === 'name') setFieldError(null);
                  setCustomerName(e.target.value);
                }}
                onFocus={() => setShowSuggestions(false)}
                placeholder="Örn. Ahmet Yılmaz"
                autoComplete="name"
                className={`w-full px-3 py-2.5 border rounded-xl text-sm focus:ring-2 focus:ring-orange-400 focus:border-transparent bg-white ${
                  fieldError === 'name' ? 'border-red-400 ring-2 ring-red-200' : 'border-slate-300'
                }`}
              />
              {fieldError === 'name' && (
                <p className="mt-1.5 text-xs font-semibold text-red-600" role="alert">
                  Müşteri adı zorunludur — hemen bu alana yazabilirsiniz.
                </p>
              )}
            </div>

            <div>
              <label className="text-xs font-bold text-slate-600 mb-1 block">
                Adres {isDelivery ? <span className="text-red-500">*</span> : <span className="text-slate-400 font-normal">(opsiyonel)</span>}
              </label>
              <textarea
                ref={addressInputRef}
                value={deliveryAddress}
                onChange={e => {
                  if (fieldError === 'address') setFieldError(null);
                  setDeliveryAddress(e.target.value);
                }}
                placeholder="Mahalle, sokak, bina, daire..."
                rows={2}
                className={`w-full px-3 py-2.5 border rounded-xl text-sm focus:ring-2 focus:ring-orange-400 focus:border-transparent resize-none ${
                  fieldError === 'address' ? 'border-red-400 bg-red-50/50' : 'border-slate-300'
                }`}
              />
              {fieldError === 'address' && (
                <p className="mt-1.5 text-xs font-semibold text-red-600" role="alert">
                  Teslimat için adres zorunludur.
                </p>
              )}
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

            {(isDelivery || subtype === 'takeaway') && (
              <div className="space-y-2">
                {isDelivery && (
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
                )}

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
                {fieldError === 'cart' && (
                  <p className="mb-2 text-xs font-semibold text-red-600 text-center" role="alert">
                    En az 1 ürün ekleyin.
                  </p>
                )}
                {submitError && (
                  <p className="mb-2 text-xs font-semibold text-red-600 text-center px-1" role="alert">
                    {submitError}
                  </p>
                )}
                <button
                  type="button"
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

export const DeliveryOrderForm = memo(DeliveryOrderFormInner);
