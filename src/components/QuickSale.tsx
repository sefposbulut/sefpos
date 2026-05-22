import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Search, Plus, Minus, Trash2, ShoppingCart, Zap, RefreshCw, Receipt, Check,
  ScanBarcode, Camera, ChevronUp, X, PackagePlus, MessageCircle,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { PaymentModal } from './PaymentModal';
import {
  buildReceiptHtml,
  loadPrintSettings,
  printToAdisyonPrinter,
} from '../lib/printService';
import { buildHuginItemsFromOrderLines, loadHuginSettings, paymentsForHugin, sendSaleToHugin } from '../lib/huginTps';
import { dispatchPrintToast } from '../lib/printToasts';
import { BarcodeScannerModal } from './BarcodeScannerModal';
import { playScanSuccess, playScanError, primeAudio } from '../lib/beep';
import { ensureCashRegisterRowForPayment } from '../lib/cashRegisterFallback';
import { WhatsAppReceiptModal } from './WhatsAppReceiptModal';
import type { WhatsAppReceiptInput } from '../lib/whatsappReceipt';

interface Category {
  id: string;
  name: string;
  display_order?: number | null;
  vat_rate?: number | null;
  hugin_department_id?: number | null;
}

interface Product {
  id: string;
  name: string;
  price: number;
  category_id: string | null;
  image_url: string | null;
  is_available: boolean;
  is_active: boolean;
  tax_rate?: number | null;
  printer_name?: string | null;
  barcode?: string | null;
  categories?: Category | null;
}

interface CartLine {
  product: Product;
  quantity: number;
}

type PaymentMethod = 'cash' | 'credit_card' | 'open_account';

export function QuickSale() {
  const { tenant, user, activeBranch } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  // Aktif şubenin "her satışa otomatik %X iskonto" ayarı (Settings → Şubeler).
  // Pasifse 0, aktifse şubenin yüzdesi. Kullanıcı tek satışta değiştirebilir;
  // yeni satışta tekrar bu varsayılana döner.
  const branchDefaultDiscount =
    activeBranch?.default_discount_active && activeBranch?.default_discount_percent
      ? Math.min(100, Math.max(0, Number(activeBranch.default_discount_percent)))
      : 0;
  const [discount, setDiscount] = useState<number>(branchDefaultDiscount);
  // Şube değiştiğinde ya da Settings'ten varsayılan iskonto güncellendiğinde
  // (kullanıcı kendisi değiştirmediyse) UI değerini yenile.
  const discountTouchedRef = useRef(false);
  useEffect(() => {
    if (!discountTouchedRef.current) setDiscount(branchDefaultDiscount);
  }, [branchDefaultDiscount]);
  const setDiscountSafely = useCallback((v: number) => {
    discountTouchedRef.current = true;
    setDiscount(v);
  }, []);
  const [showPayment, setShowPayment] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lastReceiptInfo, setLastReceiptInfo] = useState<{
    orderNumber: string;
    total: number;
    method: string;
  } | null>(null);
  const lastReceiptTimerRef = useRef<number | null>(null);
  const [lastReceiptData, setLastReceiptData] = useState<WhatsAppReceiptInput | null>(null);
  const [lastReceiptDefaultPhone, setLastReceiptDefaultPhone] = useState<string | null>(null);
  const [showWaModal, setShowWaModal] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [scanFlash, setScanFlash] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const scanFlashTimerRef = useRef<number | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const productsRef = useRef<Product[]>([]);
  useEffect(() => { productsRef.current = products; }, [products]);
  // Bilinmeyen barkod → hızlı ürün ekleme modalı
  const [quickProduct, setQuickProduct] = useState<{ barcode: string; name: string; price: string; categoryId: string; taxRate: string } | null>(null);
  const [quickProductBusy, setQuickProductBusy] = useState(false);
  // Mobil sepet alt sayfası (slide-up bottom sheet)
  const [mobileCartOpen, setMobileCartOpen] = useState(false);

  // ─── Veri yükleme ─────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!tenant?.id) return;
    setLoading(true);
    const [{ data: prods }, { data: cats }] = await Promise.all([
      supabase
        .from('products')
        .select('id, name, price, category_id, image_url, is_available, is_active, tax_rate, printer_name, barcode, categories:category_id(id, name, display_order, vat_rate, hugin_department_id)')
        .eq('tenant_id', tenant.id)
        .eq('is_active', true)
        .eq('is_available', true)
        .order('name'),
      supabase
        .from('categories')
        .select('id, name, display_order, vat_rate, hugin_department_id')
        .eq('tenant_id', tenant.id)
        .order('display_order')
        .order('name'),
    ]);
    setProducts(((prods as any[] | null) || []) as Product[]);
    setCategories(((cats as any[] | null) || []) as Category[]);
    setLoading(false);
  }, [tenant?.id]);

  useEffect(() => { void load(); }, [load]);

  // ─── Hesap ────────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (selectedCategory && p.category_id !== selectedCategory) return false;
      if (q && !p.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [products, selectedCategory, search]);

  const subtotal = useMemo(
    () => cart.reduce((s, l) => s + Number(l.product.price) * l.quantity, 0),
    [cart],
  );
  const discountAmount = useMemo(
    () => Math.max(0, (subtotal * Math.max(0, Math.min(100, discount))) / 100),
    [subtotal, discount],
  );
  const total = useMemo(() => Math.max(0, subtotal - discountAmount), [subtotal, discountAmount]);
  const itemCount = useMemo(() => cart.reduce((s, l) => s + l.quantity, 0), [cart]);

  // ─── Sepet işlemleri ──────────────────────────────────────────────────────
  const addToCart = useCallback((p: Product) => {
    setCart((prev) => {
      const idx = prev.findIndex((l) => l.product.id === p.id);
      if (idx >= 0) {
        const next = prev.slice();
        next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 };
        return next;
      }
      return [...prev, { product: p, quantity: 1 }];
    });
  }, []);

  const inc = useCallback((id: string) => {
    setCart((prev) => prev.map((l) => l.product.id === id ? { ...l, quantity: l.quantity + 1 } : l));
  }, []);

  const dec = useCallback((id: string) => {
    setCart((prev) => prev.flatMap((l) => {
      if (l.product.id !== id) return [l];
      if (l.quantity <= 1) return [];
      return [{ ...l, quantity: l.quantity - 1 }];
    }));
  }, []);

  const removeLine = useCallback((id: string) => {
    setCart((prev) => prev.filter((l) => l.product.id !== id));
  }, []);

  const clearCart = useCallback(() => {
    setCart([]);
    discountTouchedRef.current = false;
    setDiscount(branchDefaultDiscount);
  }, [branchDefaultDiscount]);

  // ─── Barkod arama / okuma ────────────────────────────────────────────────
  const flashScan = useCallback((kind: 'ok' | 'err', text: string) => {
    setScanFlash({ kind, text });
    if (scanFlashTimerRef.current) window.clearTimeout(scanFlashTimerRef.current);
    scanFlashTimerRef.current = window.setTimeout(() => setScanFlash(null), 1800);
  }, []);

  const findByBarcode = useCallback(async (raw: string): Promise<Product | null> => {
    const code = raw.trim();
    if (!code) return null;
    // Önce yerel cache
    const local = productsRef.current.find((p) => (p.barcode || '').trim() === code);
    if (local) return local;
    // Sonra DB (cache dışı veya pasif yenilenmemişse)
    if (!tenant?.id) return null;
    const { data } = await supabase
      .from('products')
      .select('id, name, price, category_id, image_url, is_available, is_active, tax_rate, printer_name, barcode, categories:category_id(id, name, display_order, vat_rate, hugin_department_id)')
      .eq('tenant_id', tenant.id)
      .eq('barcode', code)
      .eq('is_active', true)
      .eq('is_available', true)
      .limit(1)
      .maybeSingle();
    return (data as any as Product | null) || null;
  }, [tenant?.id]);

  const handleBarcodeCode = useCallback(async (code: string, opts?: { fromCamera?: boolean }) => {
    const trimmed = code.trim();
    if (!trimmed) return;
    const p = await findByBarcode(trimmed);
    if (p) {
      // Kameradan gelmediyse (USB/Enter) burada beep çal — kamera modalı zaten kendi beep'ini çalıyor
      if (!opts?.fromCamera) playScanSuccess();
      addToCart(p);
      flashScan('ok', `${p.name} sepete eklendi`);
      setSearch('');
      try { searchInputRef.current?.focus(); } catch { /* noop */ }
    } else {
      // Sistemde olmayan barkod → hızlı ürün ekleme modalını aç
      // (Kameradan da olsa "barkod var ama ürün yok" farklı bir durum, hata sesi çalsın)
      playScanError();
      setQuickProduct({
        barcode: trimmed,
        name: '',
        price: '',
        categoryId: '',
        taxRate: '',
      });
      flashScan('err', `Yeni barkod: ${trimmed} — ürün bilgisi girin`);
    }
  }, [findByBarcode, addToCart, flashScan]);

  // Hızlı ürün ekleme — modaldaki kaydet butonu
  const saveQuickProduct = useCallback(async () => {
    if (!quickProduct) return;
    if (!tenant?.id) return;
    const name = quickProduct.name.trim();
    const priceNum = Number(String(quickProduct.price).replace(',', '.'));
    if (!name) { alert('Ürün adı zorunlu'); return; }
    if (!Number.isFinite(priceNum) || priceNum < 0) { alert('Geçerli bir fiyat girin'); return; }
    setQuickProductBusy(true);
    try {
      const cat = categories.find((c) => c.id === quickProduct.categoryId) || null;
      const taxFromInput = quickProduct.taxRate.trim() === '' ? null : Number(String(quickProduct.taxRate).replace(',', '.'));
      const taxRate = Number.isFinite(taxFromInput as number)
        ? (taxFromInput as number)
        : (cat?.vat_rate ?? null);
      const payload: any = {
        tenant_id: tenant.id,
        name,
        price: priceNum,
        barcode: quickProduct.barcode,
        category_id: cat?.id || null,
        is_active: true,
        is_available: true,
      };
      if (taxRate !== null && taxRate !== undefined) payload.tax_rate = taxRate;
      const { data, error } = await supabase
        .from('products')
        .insert(payload)
        .select('id, name, price, category_id, image_url, is_available, is_active, tax_rate, printer_name, barcode, categories:category_id(id, name, display_order, vat_rate, hugin_department_id)')
        .single();
      if (error || !data) {
        const msg = (error as any)?.message || '';
        if (/duplicate|unique/i.test(msg)) {
          alert('Bu barkod zaten başka bir üründe kayıtlı. Önce mevcut ürünü kontrol edin.');
        } else {
          alert('Ürün kaydedilemedi: ' + (msg || 'bilinmeyen hata'));
        }
        return;
      }
      const newProduct = data as any as Product;
      // Yerel listeye ekle — bir sonraki taramada cache'den bulunsun
      setProducts((prev) => [...prev, newProduct].sort((a, b) => a.name.localeCompare(b.name, 'tr')));
      addToCart(newProduct);
      flashScan('ok', `${newProduct.name} eklendi ve sepete kondu`);
      setQuickProduct(null);
      try { searchInputRef.current?.focus(); } catch { /* noop */ }
    } catch (e: any) {
      alert('Ürün kaydedilemedi: ' + (e?.message || String(e)));
    } finally {
      setQuickProductBusy(false);
    }
  }, [quickProduct, tenant?.id, categories, addToCart, flashScan]);

  const handleSearchKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const value = (e.currentTarget.value || '').trim();
    if (!value) return;
    // Barkod gibi görünen değerleri (yalnızca rakam, en az 6 hane) doğrudan barkod kabul et
    const looksLikeBarcode = /^[0-9]{6,}$/.test(value);
    if (looksLikeBarcode) {
      void handleBarcodeCode(value);
      return;
    }
    // Aksi halde tek bir filtrelenmiş ürün varsa onu sepete ekle
    const matches = productsRef.current.filter((p) => p.name.toLowerCase().includes(value.toLowerCase()));
    if (matches.length === 1) {
      addToCart(matches[0]);
      setSearch('');
      flashScan('ok', `${matches[0].name} sepete eklendi`);
    } else {
      // Birden fazla eşleşme varsa hiçbir şey yapma — kullanıcı seçsin
      void handleBarcodeCode(value); // yine de barkod denemesi
    }
  }, [handleBarcodeCode, addToCart, flashScan]);

  // ─── Ödeme ────────────────────────────────────────────────────────────────
  const handlePayment = useCallback(async (
    method: PaymentMethod,
    amount: number,
    printReceipt: boolean,
    customerId?: string,
  ) => {
    if (!tenant?.id || !user?.id || cart.length === 0) return;
    if (busy) return;
    setBusy(true);

    const branchId = activeBranch?.id || null;
    const orderNumber = `H${Date.now().toString().slice(-8)}`;
    const nowIso = new Date().toISOString();
    const totalNow = total;
    const subtotalNow = subtotal;
    const discountNow = discountAmount;
    // İki ondalık hassasiyet korunsun (örn. 3,38). Round yapmıyoruz; sadece
    // 0-100 aralığına klampla + 2 ondalığa kestir.
    const discountPctNow = Math.min(100, Math.max(0, Math.round(discount * 100) / 100));

    // Cari (açık hesap) ödemelerde fiş üstüne basılacak müşteri bilgisi
    // ve önceki/yeni bakiye snapshot'ı. Ödeme öncesi yakalanır.
    let openAccountCustomer: { name: string; phone: string | null } | null = null;
    let openAccountPrevBalance: number | null = null;

    try {
      // 1) Cari ödeme öncesi limit kontrolü + bakiye snapshot
      if (method === 'open_account') {
        if (!customerId) {
          alert('Cari hesap ödemesi için müşteri seçin.');
          return;
        }
        const { data: cust, error: custErr } = await supabase
          .from('customers')
          .select('id, current_balance, credit_limit, name, phone, is_active')
          .eq('id', customerId)
          .eq('tenant_id', tenant.id)
          .maybeSingle();
        if (custErr || !cust) { alert('Cari hesap bulunamadı.'); return; }
        if (!cust.is_active) { alert('Bu cari hesap pasif.'); return; }
        const bal = Number(cust.current_balance) || 0;
        const limit = Number(cust.credit_limit) || 0;
        if (limit > 0 && bal + amount > limit) {
          if (!window.confirm(`Kredi limiti (${limit.toFixed(2)} ₺) aşılacak. Yine de işlensin mi?`)) return;
        }
        openAccountCustomer = { name: (cust as any).name || '', phone: (cust as any).phone || null };
        openAccountPrevBalance = bal;
      }

      // 2) Sipariş oluştur (counter, status pending önce, sonra completed)
      const { data: order, error: orderErr } = await supabase
        .from('orders')
        .insert({
          tenant_id: tenant.id,
          branch_id: branchId,
          table_id: null,
          order_number: orderNumber,
          order_type: 'counter',
          status: 'pending',
          payment_status: 'unpaid',
          subtotal: subtotalNow,
          tax_amount: 0,
          discount_amount: discountNow,
          total_amount: totalNow,
          created_by: user.id,
          waiter_id: user.id,
          waiter_name: (user as any).user_metadata?.full_name || (user as any).email || null,
        } as any)
        .select('id, order_number')
        .single();
      if (orderErr || !order) throw orderErr || new Error('Sipariş oluşturulamadı');

      // 3) Order items
      const itemsPayload = cart.map((l) => ({
        order_id: order.id,
        tenant_id: tenant.id,
        product_id: l.product.id,
        variant_id: null,
        quantity: l.quantity,
        unit_price: Number(l.product.price),
        total_amount: Number(l.product.price) * l.quantity,
        tax_rate: l.product.tax_rate ?? l.product.categories?.vat_rate ?? null,
        status: 'served',
      }));
      const { error: itemsErr } = await supabase.from('order_items').insert(itemsPayload as any);
      if (itemsErr) throw itemsErr;

      // 4) payment_transactions
      const { error: payErr } = await supabase.from('payment_transactions').insert({
        tenant_id: tenant.id,
        order_id: order.id,
        payment_method: method,
        amount,
        created_by: user.id,
        ...(method === 'open_account' && customerId ? { customer_id: customerId } : {}),
      } as any);
      if (payErr) throw payErr;

      // 5) Cari ödeme: customer_transactions + bakiye güncelle
      if (method === 'open_account' && customerId) {
        await supabase.from('customer_transactions').insert({
          tenant_id: tenant.id,
          customer_id: customerId,
          order_id: order.id,
          type: 'debt',
          amount,
          note: `Hızlı satış · Sipariş #${order.order_number}`,
          created_by: user.id,
        } as any);
        const { data: custFresh } = await supabase
          .from('customers')
          .select('current_balance')
          .eq('id', customerId)
          .maybeSingle();
        const newBal = (Number(custFresh?.current_balance) || 0) + amount;
        await supabase.from('customers').update({ current_balance: newBal }).eq('id', customerId);
      }

      // 6) orders'ı completed olarak işaretle (recipe deduct trigger'ı tetiklenir)
      await supabase.from('orders').update({
        status: 'completed',
        payment_status: 'paid',
        paid_at: nowIso,
        payment_method: method,
      } as any).eq('id', order.id);

      void ensureCashRegisterRowForPayment({
        tenantId: tenant.id,
        branchId: branchId,
        orderId: order.id,
        orderNumber: order.order_number,
        paymentMethod: method,
        amount,
        createdBy: user.id,
        tableLabel: 'Hızlı Satış',
      });

      // 7) Reçetesi olmayan ürünler için products.stock_quantity düşümü
      // (recipe trigger sadece reçeteli ürünleri ingredients'tan düşer; ürün stoğu için fallback)
      void Promise.all(cart.map(async (l) => {
        const { count } = await supabase
          .from('recipes')
          .select('id', { head: true, count: 'exact' })
          .eq('tenant_id', tenant.id)
          .eq('product_id', l.product.id)
          .limit(1);
        if ((count || 0) > 0) return; // reçete varsa trigger hallediyor
        const { data: prow } = await supabase
          .from('products')
          .select('stock_quantity, cost')
          .eq('id', l.product.id)
          .maybeSingle();
        if (prow) {
          const cur = Number((prow as any).stock_quantity || 0);
          const next = Math.max(0, cur - l.quantity);
          await supabase.from('products').update({ stock_quantity: next }).eq('id', l.product.id);
          const unitCost = Number((prow as any).cost || 0);
          await supabase.from('stock_movements').insert({
            tenant_id: tenant.id,
            product_id: l.product.id,
            movement_type: 'out',
            quantity: l.quantity,
            unit_cost: unitCost,
            total_cost: Number((unitCost * l.quantity).toFixed(2)),
            source_branch_id: branchId,
            reference_type: 'sale_order',
            reference_no: order.id,
            note: `Hızlı satış #${order.order_number}`,
          } as any);
        }
      })).catch((e) => console.warn('quick-sale stock fallback:', e));

      // 8) Hugin yazarkasa + fiş yazdırma (arka plan)
      const printSettings = loadPrintSettings();
      if (loadHuginSettings().enabled) {
        const huginPay = paymentsForHugin([{ payment_method: method, amount }]);
        const huginItems = buildHuginItemsFromOrderLines(
          cart.map((l) => ({
            quantity: l.quantity,
            unit_price: Number(l.product.price),
            total_amount: Number(l.product.price) * l.quantity,
            products: {
              name: l.product.name,
              category_id: l.product.category_id,
              categories: l.product.categories,
            },
          })),
        );
        if (huginPay.length > 0 && huginItems.length > 0) {
          void sendSaleToHugin({
            orderNumber: order.order_number,
            tableLabel: 'Hızlı Satış',
            items: huginItems,
            totalAmount: totalNow,
            discountAmount: discountNow,
            payments: huginPay,
          }).then((r) => {
            if (r.skipped) return;
            if (r.success) {
              dispatchPrintToast({ kind: 'success', message: 'Mali fiş yazarkasaya gönderildi', target: 'Hugin' });
            } else {
              dispatchPrintToast({ kind: 'error', message: 'Yazarkasa fişi basılamadı', detail: r.error, target: 'Hugin' });
            }
          });
        }
      }

      if (printReceipt) {
        const html = buildReceiptHtml({
          restaurantName: printSettings.restaurantName || (tenant as any)?.name || 'ŞefPOS',
          restaurantPhone: printSettings.restaurantPhone,
          restaurantAddress: printSettings.restaurantAddress,
          tableLabel: 'Hızlı Satış',
          orderNumber: order.order_number,
          items: cart.map((l) => ({
            productName: l.product.name,
            variantName: null,
            quantity: l.quantity,
            unitPrice: Number(l.product.price),
            totalAmount: Number(l.product.price) * l.quantity,
            notes: null,
          })),
          subtotal: subtotalNow,
          taxAmount: 0,
          discountAmount: discountNow,
          total: totalNow,
          paymentMethod: method,
          footer: printSettings.receiptFooter,
          printStyle: printSettings.printStyle,
        });
        void printToAdisyonPrinter(printSettings, html).then((r) => {
          if (!r.success) console.warn('[ŞefPOS] Hızlı satış fişi:', r.error);
        });
      }

      // 10) UI sıfırlama + son satış göstergesi
      setLastReceiptInfo({
        orderNumber: order.order_number,
        total: totalNow,
        method,
      });
      const isOpenAcc = method === 'open_account' && customerId;
      const newBalance = isOpenAcc && openAccountPrevBalance !== null
        ? openAccountPrevBalance + amount
        : null;
      // Adres/telefon: önce yazıcı ayarlarındaki değer, yoksa tenant'ın kayıtlı
      // değeri. Hiçbiri yoksa fiş üstünde gizli kalır.
      const headerPhone = (printSettings.restaurantPhone || (tenant as any)?.phone || '').toString().trim();
      const headerAddress = (printSettings.restaurantAddress || (tenant as any)?.address || '').toString().trim();
      setLastReceiptData({
        restaurantName: printSettings.restaurantName || (tenant as any)?.name || 'ŞefPOS',
        restaurantPhone: headerPhone || null,
        restaurantAddress: headerAddress || null,
        tableLabel: 'Hızlı Satış',
        orderNumber: order.order_number,
        items: cart.map((l) => ({
          productName: l.product.name,
          variantName: null,
          quantity: l.quantity,
          unitPrice: Number(l.product.price),
          totalAmount: Number(l.product.price) * l.quantity,
          notes: null,
        })),
        subtotal: subtotalNow,
        taxAmount: 0,
        discountAmount: discountNow,
        discountPercent: discountPctNow,
        total: totalNow,
        paymentMethod: method,
        customerName: openAccountCustomer?.name || null,
        previousBalance: isOpenAcc ? openAccountPrevBalance : null,
        newBalance,
        footer: printSettings.receiptFooter,
      });
      setLastReceiptDefaultPhone(openAccountCustomer?.phone || null);
      if (lastReceiptTimerRef.current) window.clearTimeout(lastReceiptTimerRef.current);
      lastReceiptTimerRef.current = window.setTimeout(() => setLastReceiptInfo(null), 9000);

      clearCart();
      setShowPayment(false);
    } catch (e: any) {
      console.error('Quick sale payment error:', e);
      alert('Satış kaydedilemedi: ' + (e?.message || String(e)));
    } finally {
      setBusy(false);
    }
  }, [tenant?.id, user?.id, activeBranch?.id, cart, total, subtotal, discount, discountAmount, busy, clearCart]);

  // ─── UI ───────────────────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Üst bar */}
      <div className="bg-white border-b border-slate-200 shadow-sm shrink-0 px-3 md:px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg md:text-xl font-black text-slate-800">Hızlı Satış</h1>
            <div className="text-[11px] md:text-xs text-slate-500 font-semibold">
              Tezgâh / take-out — masa açmadan anında satış
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {lastReceiptData && (
            <button
              type="button"
              onClick={() => setShowWaModal(true)}
              title="Son satışın fişini WhatsApp ile gönder"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-br from-emerald-500 to-green-600 hover:brightness-110 active:scale-95 text-white rounded-xl shadow border border-emerald-700/30"
            >
              <MessageCircle className="w-4 h-4" />
              <span className="text-xs font-black hidden sm:inline">WhatsApp'a Gönder</span>
            </button>
          )}
          {lastReceiptInfo && (
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-xl">
              <Check className="w-4 h-4 text-emerald-600" />
              <span className="text-xs font-black text-emerald-700">
                #{lastReceiptInfo.orderNumber} · {lastReceiptInfo.total.toFixed(0)}₺ ✓
              </span>
            </div>
          )}
          <button
            onClick={() => void load()}
            className="px-3 py-2 bg-white border-2 border-slate-200 hover:border-orange-400 rounded-xl text-sm font-bold text-slate-700 active:scale-95 flex items-center gap-1.5"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col md:flex-row min-h-0 relative">
        {/* Sol: ürün ızgarası */}
        <div className="flex-1 min-h-0 flex flex-col p-3 md:p-4 gap-3 overflow-hidden pb-[calc(124px+env(safe-area-inset-bottom))] md:pb-4">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                ref={searchInputRef}
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                onFocus={() => primeAudio()}
                placeholder="Ürün ara veya barkod oku (Enter ile tara)…"
                className="w-full pl-10 pr-24 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-medium focus:border-orange-400 focus:outline-none bg-white"
                inputMode="search"
                autoComplete="off"
                spellCheck={false}
              />
              <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => { primeAudio(); setShowScanner(true); }}
                  title="Kameradan barkod oku"
                  aria-label="Kameradan barkod oku"
                  className="px-2.5 py-1.5 rounded-lg bg-gradient-to-br from-amber-400 via-orange-500 to-red-500 text-white shadow active:scale-95 hover:brightness-110 flex items-center gap-1.5"
                >
                  <Camera className="w-4 h-4" />
                  <ScanBarcode className="w-4 h-4 hidden sm:inline" />
                </button>
              </div>
            </div>
          </div>

          {scanFlash && (
            <div
              className={`px-3 py-2 rounded-xl text-sm font-bold shadow-sm border ${
                scanFlash.kind === 'ok'
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-red-50 text-red-700 border-red-200'
              }`}
              role="status"
              aria-live="polite"
            >
              {scanFlash.kind === 'ok' ? '✓ ' : '⚠ '}{scanFlash.text}
            </div>
          )}

          <div className="flex gap-1.5 overflow-x-auto pb-1">
            <button
              onClick={() => setSelectedCategory(null)}
              className={`px-3 py-2 rounded-xl whitespace-nowrap shrink-0 text-xs md:text-sm font-bold border-2 active:scale-95 ${
                selectedCategory === null
                  ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white border-orange-600 shadow'
                  : 'bg-white border-slate-200 text-slate-700 hover:border-orange-300'
              }`}
            >
              Tümü
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedCategory(c.id)}
                className={`px-3 py-2 rounded-xl whitespace-nowrap shrink-0 text-xs md:text-sm font-bold border-2 active:scale-95 ${
                  selectedCategory === c.id
                    ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white border-orange-600 shadow'
                    : 'bg-white border-slate-200 text-slate-700 hover:border-orange-300'
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto pr-1">
            {loading ? (
              <div className="flex items-center justify-center py-12 text-slate-400">
                <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Yükleniyor…
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 text-slate-400 font-medium">Ürün bulunamadı</div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 md:gap-3">
                {filtered.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => addToCart(p)}
                    className="bg-white border-2 border-slate-200 hover:border-orange-400 rounded-xl p-2 md:p-3 text-left shadow-sm hover:shadow-md active:scale-95 transition-all flex flex-col gap-1 min-h-[78px] md:min-h-[92px]"
                  >
                    {p.image_url ? (
                      <img
                        src={p.image_url}
                        alt={p.name}
                        loading="lazy"
                        className="w-full h-16 md:h-20 object-cover rounded-lg"
                      />
                    ) : (
                      <div className="w-full h-16 md:h-20 rounded-lg bg-gradient-to-br from-orange-50 to-amber-100 flex items-center justify-center">
                        <ShoppingCart className="w-6 h-6 text-orange-300" />
                      </div>
                    )}
                    <div className="font-bold text-slate-800 text-xs md:text-sm leading-tight line-clamp-2">{p.name}</div>
                    <div className="text-orange-600 font-black text-sm md:text-base mt-auto">
                      {Number(p.price).toFixed(0)} ₺
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sağ: sepet — masaüstünde sabit yan panel */}
        <div className="hidden md:flex md:w-96 lg:w-[420px] bg-white md:border-l border-slate-200 shadow-inner flex-col shrink-0 md:max-h-none">
          <div className="px-4 py-3 border-b border-slate-100 bg-gradient-to-r from-orange-50 to-amber-50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShoppingCart className="w-5 h-5 text-orange-600" />
              <h3 className="text-base font-black text-slate-800">Sepet</h3>
              {itemCount > 0 && (
                <span className="text-[11px] font-black bg-orange-500 text-white rounded-full px-2 py-0.5">
                  {itemCount}
                </span>
              )}
            </div>
            {cart.length > 0 && (
              <button
                onClick={clearCart}
                className="text-xs font-bold text-red-500 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded-lg"
              >
                Temizle
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
            {cart.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-sm font-medium">
                Sepet boş — soldan ürün seç
              </div>
            ) : (
              cart.map((l) => (
                <div
                  key={l.product.id}
                  className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 flex items-center gap-2"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-slate-800 text-sm leading-tight">{l.product.name}</div>
                    <div className="text-xs text-slate-500">
                      {Number(l.product.price).toFixed(0)} ₺ × {l.quantity}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => dec(l.product.id)}
                      className="w-7 h-7 bg-orange-100 hover:bg-orange-200 rounded-lg flex items-center justify-center active:scale-90"
                    >
                      <Minus className="w-3.5 h-3.5 text-orange-700" />
                    </button>
                    <span className="w-6 text-center font-black text-sm">{l.quantity}</span>
                    <button
                      onClick={() => inc(l.product.id)}
                      className="w-7 h-7 bg-gradient-to-br from-orange-500 to-amber-500 rounded-lg flex items-center justify-center active:scale-90"
                    >
                      <Plus className="w-3.5 h-3.5 text-white" />
                    </button>
                  </div>
                  <div className="font-black text-orange-600 text-sm w-16 text-right shrink-0">
                    {(Number(l.product.price) * l.quantity).toFixed(0)}₺
                  </div>
                  <button
                    onClick={() => removeLine(l.product.id)}
                    className="text-red-400 hover:text-red-600 p-1 rounded-lg"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="border-t border-slate-100 p-3 space-y-2 bg-white">
            <div className="space-y-1">
              <div className="flex justify-between text-sm text-slate-600">
                <span>Ara Toplam</span>
                <span className="font-bold">{subtotal.toFixed(2)} ₺</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between text-sm text-green-600">
                  <span className="font-medium">İskonto ({discount}%)</span>
                  <span className="font-bold">-{discountAmount.toFixed(2)} ₺</span>
                </div>
              )}
              <div className="flex justify-between text-xl pt-1 border-t border-slate-200">
                <span className="font-black">TOPLAM</span>
                <span className="font-black text-orange-600">{total.toFixed(0)} ₺</span>
              </div>
            </div>
            <button
              onClick={() => {
                if (cart.length === 0) return;
                setShowPayment(true);
              }}
              disabled={cart.length === 0 || busy}
              className="w-full bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white font-black py-3.5 rounded-xl text-base shadow-lg active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <Receipt className="w-5 h-5" />
              {busy ? 'İşleniyor…' : `ÖDEMEYE GEÇ · ${total.toFixed(0)}₺`}
            </button>
            <div className="flex gap-2">
              <button
                onClick={() => void load()}
                className="flex-1 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold active:scale-95 flex items-center justify-center gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                Ürünleri yenile
              </button>
            </div>
          </div>
        </div>

        {/* Mobil bottom-sheet sepet — yukarı kayan */}
        <>
          {mobileCartOpen && (
            <div
              className="md:hidden fixed inset-0 bg-black/45 z-30"
              onClick={() => setMobileCartOpen(false)}
              aria-hidden
            />
          )}
          <div
            className={`md:hidden fixed inset-x-0 bottom-0 z-40 bg-white border-t-2 border-orange-200 rounded-t-3xl shadow-[0_-12px_30px_rgba(0,0,0,0.18)] flex flex-col transition-[transform,height] duration-300 ease-out ${
              mobileCartOpen ? 'h-[88dvh]' : 'h-[124px]'
            }`}
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
            role="dialog"
            aria-label="Sepet"
          >
            {/* Tutamaç + özet bar (her zaman görünür) */}
            <button
              type="button"
              onClick={() => setMobileCartOpen((v) => !v)}
              className="w-full px-4 pt-2.5 pb-2 flex flex-col items-stretch active:bg-orange-50/50"
              aria-expanded={mobileCartOpen}
              aria-controls="mobile-cart-body"
            >
              <div className="mx-auto w-12 h-1.5 bg-slate-300 rounded-full" />
              <div className="mt-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="relative">
                    <ShoppingCart className="w-5 h-5 text-orange-600" />
                    {itemCount > 0 && (
                      <span className="absolute -top-1.5 -right-2 text-[10px] font-black bg-orange-500 text-white rounded-full px-1.5 py-0.5 leading-none min-w-[18px] text-center">
                        {itemCount}
                      </span>
                    )}
                  </div>
                  <span className="text-sm font-black text-slate-800 truncate">
                    {cart.length === 0 ? 'Sepet boş' : `Sepet · ${itemCount} ürün`}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-base font-black text-orange-600">{total.toFixed(0)} ₺</span>
                  <ChevronUp
                    className={`w-5 h-5 text-slate-500 transition-transform ${mobileCartOpen ? 'rotate-180' : ''}`}
                  />
                </div>
              </div>
            </button>

            {/* Genişletilmiş gövde */}
            <div
              id="mobile-cart-body"
              className={`flex-1 min-h-0 flex flex-col ${mobileCartOpen ? '' : 'hidden'}`}
            >
              <div className="px-4 py-2 border-y border-slate-100 bg-gradient-to-r from-orange-50 to-amber-50 flex items-center justify-between">
                <h3 className="text-sm font-black text-slate-700">Sepet İçeriği</h3>
                <div className="flex items-center gap-2">
                  {cart.length > 0 && (
                    <button
                      onClick={clearCart}
                      className="text-xs font-bold text-red-500 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded-lg"
                    >
                      Temizle
                    </button>
                  )}
                  <button
                    onClick={() => setMobileCartOpen(false)}
                    className="p-1.5 rounded-lg bg-white border border-slate-200 active:scale-95"
                    aria-label="Sepeti kapat"
                  >
                    <X className="w-4 h-4 text-slate-600" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
                {cart.length === 0 ? (
                  <div className="text-center py-12 text-slate-400 text-sm font-medium">
                    Sepet boş — soldan ürün seç veya barkod oku
                  </div>
                ) : (
                  cart.map((l) => (
                    <div
                      key={l.product.id}
                      className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 flex items-center gap-2"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-slate-800 text-sm leading-tight">{l.product.name}</div>
                        <div className="text-xs text-slate-500">
                          {Number(l.product.price).toFixed(0)} ₺ × {l.quantity}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => dec(l.product.id)}
                          className="w-8 h-8 bg-orange-100 hover:bg-orange-200 rounded-lg flex items-center justify-center active:scale-90"
                          aria-label="Azalt"
                        >
                          <Minus className="w-4 h-4 text-orange-700" />
                        </button>
                        <span className="w-7 text-center font-black text-sm">{l.quantity}</span>
                        <button
                          onClick={() => inc(l.product.id)}
                          className="w-8 h-8 bg-gradient-to-br from-orange-500 to-amber-500 rounded-lg flex items-center justify-center active:scale-90"
                          aria-label="Arttır"
                        >
                          <Plus className="w-4 h-4 text-white" />
                        </button>
                      </div>
                      <div className="font-black text-orange-600 text-sm w-16 text-right shrink-0">
                        {(Number(l.product.price) * l.quantity).toFixed(0)}₺
                      </div>
                      <button
                        onClick={() => removeLine(l.product.id)}
                        className="text-red-400 hover:text-red-600 p-1 rounded-lg"
                        aria-label="Sil"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>

              <div className="border-t border-slate-100 px-3 py-2 bg-white space-y-1">
                <div className="flex justify-between text-sm text-slate-600">
                  <span>Ara Toplam</span>
                  <span className="font-bold">{subtotal.toFixed(2)} ₺</span>
                </div>
                {discount > 0 && (
                  <div className="flex justify-between text-sm text-green-600">
                    <span className="font-medium">İskonto ({discount}%)</span>
                    <span className="font-bold">-{discountAmount.toFixed(2)} ₺</span>
                  </div>
                )}
                <div className="flex justify-between text-lg pt-1 border-t border-slate-200">
                  <span className="font-black">TOPLAM</span>
                  <span className="font-black text-orange-600">{total.toFixed(0)} ₺</span>
                </div>
              </div>
            </div>

            {/* ÖDE butonu — sepet kapalı/açık daima görünür */}
            <div className="px-3 pb-3 pt-2 bg-white">
              <button
                onClick={() => {
                  if (cart.length === 0) return;
                  setMobileCartOpen(false);
                  setShowPayment(true);
                }}
                disabled={cart.length === 0 || busy}
                className="w-full bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white font-black py-3.5 rounded-xl text-base shadow-lg active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Receipt className="w-5 h-5" />
                {busy ? 'İşleniyor…' : `ÖDE · ${total.toFixed(0)}₺`}
              </button>
            </div>
          </div>
        </>
      </div>

      {showPayment && (
        <PaymentModal
          remainingAmount={total}
          discount={discount}
          onDiscountChange={setDiscountSafely}
          onPayment={handlePayment}
          onClose={() => setShowPayment(false)}
          loading={busy}
        />
      )}

      {showScanner && (
        <BarcodeScannerModal
          onDetected={(code) => { void handleBarcodeCode(code, { fromCamera: true }); }}
          onClose={() => setShowScanner(false)}
        />
      )}

      {showWaModal && lastReceiptData && (
        <WhatsAppReceiptModal
          receipt={lastReceiptData}
          defaultPhone={lastReceiptDefaultPhone}
          onClose={() => setShowWaModal(false)}
        />
      )}

      {quickProduct && (
        <div className="fixed inset-0 z-[70] bg-black/55 flex items-end sm:items-center justify-center sm:p-4">
          <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92dvh]">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-gradient-to-r from-amber-500 to-orange-600 text-white">
              <div className="flex items-center gap-2">
                <PackagePlus className="w-5 h-5" />
                <h3 className="font-black">Hızlı Ürün Ekle</h3>
              </div>
              <button
                onClick={() => !quickProductBusy && setQuickProduct(null)}
                aria-label="Kapat"
                className="p-1.5 rounded-lg hover:bg-white/15 active:scale-95"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto space-y-3">
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-sm">
                <div className="text-amber-700 font-bold mb-0.5">Yeni barkod</div>
                <div className="font-mono font-black text-slate-800 break-all">{quickProduct.barcode}</div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Ürün Adı *</label>
                <input
                  type="text"
                  value={quickProduct.name}
                  onChange={(e) => setQuickProduct({ ...quickProduct, name: e.target.value })}
                  autoFocus
                  className="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-medium focus:border-orange-400 focus:outline-none"
                  placeholder="örn. Cola 33cl"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Satış Fiyatı (₺) *</label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={quickProduct.price}
                  onChange={(e) => setQuickProduct({ ...quickProduct, price: e.target.value })}
                  className="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-medium focus:border-orange-400 focus:outline-none"
                  placeholder="0,00"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Kategori</label>
                  <select
                    value={quickProduct.categoryId}
                    onChange={(e) => {
                      const cat = categories.find((c) => c.id === e.target.value);
                      setQuickProduct({
                        ...quickProduct,
                        categoryId: e.target.value,
                        // Kategori seçildiğinde KDV otomatik gelsin (kullanıcı henüz elle girmemişse)
                        taxRate: quickProduct.taxRate || (cat?.vat_rate != null ? String(cat.vat_rate) : ''),
                      });
                    }}
                    className="w-full px-2 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-medium focus:border-orange-400 focus:outline-none bg-white"
                  >
                    <option value="">Kategorisiz</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">KDV (%)</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    max="100"
                    value={quickProduct.taxRate}
                    onChange={(e) => setQuickProduct({ ...quickProduct, taxRate: e.target.value })}
                    className="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-medium focus:border-orange-400 focus:outline-none"
                    placeholder="örn. 10"
                  />
                </div>
              </div>
              <div className="text-[11px] text-slate-500 leading-relaxed">
                Ürün anında ürün listenize eklenir, kaydedilen barkod bir sonraki taramada doğrudan sepete iner. Detayları sonra "Stok yönetimi" veya "Ürünler" ekranından düzenleyebilirsiniz.
              </div>
            </div>
            <div className="border-t border-slate-100 p-3 flex gap-2 bg-slate-50">
              <button
                onClick={() => !quickProductBusy && setQuickProduct(null)}
                disabled={quickProductBusy}
                className="flex-1 px-3 py-2.5 bg-white border-2 border-slate-200 text-slate-700 rounded-xl text-sm font-bold active:scale-95 disabled:opacity-50"
              >
                İptal
              </button>
              <button
                onClick={() => void saveQuickProduct()}
                disabled={quickProductBusy || !quickProduct.name.trim() || quickProduct.price.trim() === ''}
                className="flex-[2] px-3 py-2.5 bg-gradient-to-r from-emerald-500 to-green-600 text-white rounded-xl text-sm font-black active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {quickProductBusy ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" /> Kaydediliyor…
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" /> Kaydet ve sepete ekle
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
