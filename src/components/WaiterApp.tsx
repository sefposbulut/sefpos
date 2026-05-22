import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import {
  verifyWaiterAccess,
  persistWaiterLogoutReason,
  clearWaiterLocalSession,
} from '../lib/waiterAccessGuard';
import { startAdaptivePoller } from '../lib/pollSchedule';
import { LogOut, Plus, Minus, Check, X, AlertCircle, ShoppingCart, RefreshCw, Search, ArrowRightLeft } from 'lucide-react';

interface WaiterSession {
  id: string;
  name: string;
  phone: string;
  tenant_id: string;
  branch_id?: string | null;
  loginTime: string;
}

interface RestaurantTable {
  id: string;
  table_number: number;
  status: 'available' | 'occupied' | 'reserved' | 'dirty';
  current_order_id: string | null;
  group_id: string;
  branch_id: string | null;
}

interface TableGroup {
  id: string;
  name: string;
  prefix: string;
  tables: RestaurantTable[];
}

interface Product {
  id: string;
  name: string;
  price: number;
  category_id: string | null;
}

interface CartItem {
  product: Product;
  quantity: number;
  notes?: string;
}

export function WaiterApp({ onLogout }: { onLogout: () => void }) {
  const [session, setSession] = useState<WaiterSession | null>(null);
  const [tableGroups, setTableGroups] = useState<TableGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [selectedTable, setSelectedTable] = useState<RestaurantTable | null>(null);
  const [loading, setLoading] = useState(true);

  // Order creation state
  const [showOrderPanel, setShowOrderPanel] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [productSearch, setProductSearch] = useState('');
  const [qtyMultiplier, setQtyMultiplier] = useState(1);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [moveTargetTableId, setMoveTargetTableId] = useState('');
  const [orderLoading, setOrderLoading] = useState(false);
  /** Zorla çıkış (pasif/silinmiş hesap, ağ dışı). null değilse modal gösterilir. */
  const [forcedExit, setForcedExit] = useState<{ title: string; message: string } | null>(null);
  /** İlk doğrulama tamamlanmadan UI render edilmez — pasif/silinmiş hesap UI flash'ı engellenir. */
  const [verifying, setVerifying] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem('waiter_session');
    if (saved) {
      try {
        const waiterSession = JSON.parse(saved);
        setSession(waiterSession);
      } catch {
        localStorage.removeItem('waiter_session');
        setVerifying(false);
        onLogout();
      }
    } else {
      setVerifying(false);
      onLogout();
    }
  }, []);

  /**
   * Garson hesabı / cihaz bağlama / ağ kilidi gerçek zamanlı denetimi.
   * - waiters.status !== 'active' veya satır silindi  → derhal çıkış.
   * - device_bindings.status !== 'active'             → derhal çıkış.
   * - Genel IP /24 öneki yetkili önekle eşleşmiyor    → çıkış (mobil veri vs.).
   *
   * Hem realtime sub hem 30 sn periyodik fallback hem de sayfa görünür/odaklı
   * olunca tetiklenir (uyku sonrası ilk etkileşimde anında doğrulanır).
   */
  useEffect(() => {
    if (!session) return;
    let alive = true;

    const performExit = (title: string, message: string) => {
      if (!alive) return;
      persistWaiterLogoutReason(title, message);
      clearWaiterLocalSession();
      try { void supabase.auth.signOut(); } catch { /* ignore */ }
      setForcedExit({ title, message });
      // İlk doğrulama henüz bitmediyse UI hiç açılmasın.
      setVerifying(false);
      // 1.5 sn sonra modal kapanır ve login ekranına dönülür.
      window.setTimeout(() => {
        if (!alive) return;
        setSession(null);
        onLogout();
      }, 1500);
    };

    const checkAccountState = async () => {
      if (!alive) return;
      const access = await verifyWaiterAccess(session.id, session.tenant_id);
      if (!alive) return;
      if (!access.allowed) {
        performExit(access.title, access.message);
        return;
      }

      // İlk doğrulama başarılı: UI'ı aç ve veriyi yükle.
      if (verifying) {
        setVerifying(false);
        try { loadTableGroups(session.tenant_id, session.branch_id || null); } catch { /* ignore */ }
        try { loadProducts(session.tenant_id, session.branch_id || null); } catch { /* ignore */ }
      }
    };

    void checkAccountState();

    const stopPoll = startAdaptivePoller({
      baseMs: 90_000,
      idleMs: 120_000,
      hiddenMs: 0,
      run: checkAccountState,
      immediate: false,
    });

    const onVisible = () => {
      if (document.visibilityState === 'visible') void checkAccountState();
    };
    const onFocus = () => void checkAccountState();
    const onOnline = () => void checkAccountState();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onOnline);

    const waitersChannel = supabase
      .channel(`waiter-self-${session.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'waiters', filter: `id=eq.${session.id}` },
        () => { void checkAccountState(); },
      )
      .subscribe();

    const bindingChannel = supabase
      .channel(`waiter-binding-${session.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'device_bindings', filter: `waiter_id=eq.${session.id}` },
        () => { void checkAccountState(); },
      )
      .subscribe();

    return () => {
      alive = false;
      stopPoll();
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onOnline);
      try { supabase.removeChannel(waitersChannel); } catch { /* ignore */ }
      try { supabase.removeChannel(bindingChannel); } catch { /* ignore */ }
    };
  }, [session, onLogout]);

  const loadTableGroups = async (tenantId: string, branchId?: string | null) => {
    try {
      let query = supabase
        .from('restaurant_tables')
        .select('id, table_number, status, current_order_id, group_id, branch_id, table_groups(id, name, prefix)')
        .eq('tenant_id', tenantId)
        .order('table_number');
      if (branchId) query = query.eq('branch_id', branchId);
      const { data: tables, error } = await query;

      if (error) throw error;

      const grouped = new Map<string, TableGroup>();
      tables?.forEach((table: any) => {
        if (!table.group_id || !table.table_groups?.id) return;
        const groupId = table.group_id;
        if (!grouped.has(groupId)) {
          grouped.set(groupId, {
            id: groupId,
            name: table.table_groups?.name || 'Tanımsız',
            prefix: table.table_groups?.prefix || '',
            tables: [],
          });
        }
        grouped.get(groupId)!.tables.push({
          id: table.id,
          table_number: table.table_number,
          status: table.status,
          current_order_id: table.current_order_id,
          group_id: groupId,
          branch_id: table.branch_id || null,
        });
      });

      const groups = Array.from(grouped.values()).sort((a, b) =>
        a.name.localeCompare(b.name)
      );
      setTableGroups(groups);
      if (groups.length > 0 && !selectedGroupId) {
        setSelectedGroupId(groups[0].id);
      }
    } catch (err) {
      console.error('Masa yükleme hatası:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadProducts = async (tenantId: string, _branchId?: string | null) => {
    try {
      const [catsRes, prodsRes] = await Promise.all([
        supabase
          .from('categories')
          .select('id, name')
          .eq('tenant_id', tenantId)
          .order('sort_order'),
        supabase
          .from('products')
          .select('id, name, price, category_id')
          .eq('tenant_id', tenantId)
          .eq('is_active', true)
          .order('name'),
      ]);

      if (catsRes.error) throw catsRes.error;
      if (prodsRes.error) throw prodsRes.error;

      const safeCats = (catsRes.data || []).map((c: any) => ({ id: c.id, name: c.name }));
      const safeProducts = (prodsRes.data || []).map((p: any) => ({
        id: p.id,
        name: p.name,
        price: Number(p.price) || 0,
        category_id: p.category_id || null,
      }));

      setCategories(safeCats);
      setProducts(safeProducts);

      setSelectedCategory(prev => {
        if (prev === '__all__') return '__all__';
        if (prev && safeCats.some((c: any) => c.id === prev)) return prev;
        return '__all__';
      });
    } catch (err) {
      console.error('Ürün yükleme hatası:', err);
      setCategories([]);
      setProducts([]);
    }
  };

  const handleTableClick = (table: RestaurantTable) => {
    setSelectedTable(table);
    setShowOrderPanel(true);
  };

  const handleAddToCart = (product: Product) => {
    const existingItem = cart.find(item => item.product.id === product.id);
    if (existingItem) {
      setCart(cart.map(item =>
        item.product.id === product.id
          ? { ...item, quantity: item.quantity + qtyMultiplier }
          : item
      ));
    } else {
      setCart([...cart, { product, quantity: qtyMultiplier }]);
    }
  };

  const handleRemoveFromCart = (productId: string) => {
    setCart(cart.filter(item => item.product.id !== productId));
  };

  const handleQuantityChange = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      handleRemoveFromCart(productId);
    } else {
      setCart(cart.map(item =>
        item.product.id === productId
          ? { ...item, quantity }
          : item
      ));
    }
  };

  const handleCreateOrder = async () => {
    if (!selectedTable || !session || cart.length === 0) return;

    setOrderLoading(true);
    try {
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          table_id: selectedTable.id,
          tenant_id: session.tenant_id,
          branch_id: selectedTable.branch_id || null,
          status: 'open',
          payment_status: 'unpaid',
          total_amount: cart.reduce((sum, item) => sum + (item.product.price * item.quantity), 0),
          order_type: 'dine_in',
          waiter_id: session.id,
          waiter_name: session.name,
        })
        .select()
        .single();

      if (orderError) throw orderError;

      const orderItems = cart.map(item => ({
        order_id: order.id,
        product_id: item.product.id,
        quantity: item.quantity,
        unit_price: item.product.price,
        notes: item.notes,
        tenant_id: session.tenant_id,
      }));

      const { error: itemError } = await supabase
        .from('order_items')
        .insert(orderItems);

      if (itemError) throw itemError;

      // Update table status
      await supabase
        .from('restaurant_tables')
        .update({ status: 'occupied', current_order_id: order.id })
        .eq('id', selectedTable.id);

      setCart([]);
      setShowOrderPanel(false);
      setSelectedTable(null);
      loadTableGroups(session.tenant_id, session.branch_id || null);
    } catch (err: any) {
      console.error('Sipariş oluşturma hatası:', err);
      alert(err.message || 'Sipariş oluşturulamadı');
    } finally {
      setOrderLoading(false);
    }
  };

  const handleMoveTable = async () => {
    if (!selectedTable?.current_order_id) {
      alert('Taşınacak aktif sipariş bulunamadı');
      return;
    }
    if (!moveTargetTableId || moveTargetTableId === selectedTable.id) {
      alert('Geçerli bir hedef masa seçin');
      return;
    }
    const targetTable = tableGroups.flatMap(g => g.tables).find(t => t.id === moveTargetTableId);
    if (!targetTable) {
      alert('Hedef masa bulunamadı');
      return;
    }
    if (targetTable.current_order_id || targetTable.status === 'occupied') {
      alert('Hedef masa dolu, boş masa seçin');
      return;
    }

    try {
      const movedOrderId = selectedTable.current_order_id;
      const { error: orderErr } = await supabase
        .from('orders')
        .update({ table_id: targetTable.id } as any)
        .eq('id', movedOrderId);
      if (orderErr) throw orderErr;

      const { error: destErr } = await supabase
        .from('restaurant_tables')
        .update({ current_order_id: movedOrderId, status: 'occupied' })
        .eq('id', targetTable.id);
      if (destErr) throw destErr;

      const { error: srcErr } = await supabase
        .from('restaurant_tables')
        .update({ current_order_id: null, status: 'available' })
        .eq('id', selectedTable.id);
      if (srcErr) throw srcErr;

      setMoveTargetTableId('');
      setShowOrderPanel(false);
      setSelectedTable(null);
      await loadTableGroups(session!.tenant_id, session!.branch_id || null);
      alert(`Sipariş masa ${selectedTable.table_number}'dan masa ${targetTable.table_number}'a taşındı`);
    } catch (e: any) {
      alert(e?.message || 'Masa taşıma başarısız');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('waiter_session');
    onLogout();
  };

  const currentGroup = tableGroups.find(g => g.id === selectedGroupId);
  const filteredProductsByCategory = selectedCategory && selectedCategory !== '__all__'
    ? products.filter(p => p.category_id === selectedCategory)
    : products;
  const filteredProducts = filteredProductsByCategory.filter(p =>
    !productSearch.trim() || p.name.toLowerCase().includes(productSearch.trim().toLowerCase())
  );
  const allTables = tableGroups.flatMap(g => g.tables);
  const moveCandidates = allTables.filter(t => t.id !== selectedTable?.id && !t.current_order_id && t.status !== 'occupied');

  const cartTotal = cart.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);

  if (!session) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-900">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <p className="text-white font-semibold">Oturum Bulunamadı</p>
        </div>
      </div>
    );
  }

  // İlk doğrulama tamamlanana kadar UI render edilmez; forcedExit varsa onun modal'ı görünür.
  if (verifying && !forcedExit) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-900">
        <div className="text-center">
          <RefreshCw className="w-12 h-12 text-orange-400 mx-auto mb-4 animate-spin" />
          <p className="text-white font-semibold">Hesap doğrulanıyor…</p>
          <p className="text-slate-400 text-sm mt-1">Lütfen bekleyin</p>
        </div>
      </div>
    );
  }

  if (forcedExit && verifying) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 text-center">
          <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-red-600" />
          </div>
          <h3 className="text-lg font-bold text-slate-900 mb-2">{forcedExit.title}</h3>
          <p className="text-sm text-slate-600 mb-5">{forcedExit.message}</p>
          <button
            onClick={() => {
              localStorage.removeItem('waiter_session');
              try { void supabase.auth.signOut(); } catch { /* ignore */ }
              setSession(null);
              onLogout();
            }}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2.5 rounded-xl transition-colors"
          >
            Giriş Ekranına Dön
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900">
      {forcedExit && (
        <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 text-center">
            <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-8 h-8 text-red-600" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 mb-2">{forcedExit.title}</h3>
            <p className="text-sm text-slate-600 mb-5">{forcedExit.message}</p>
            <div className="text-xs text-slate-400 mb-3">Birkaç saniye içinde otomatik çıkış yapılacak…</div>
            <button
              onClick={() => {
                localStorage.removeItem('waiter_session');
                try { void supabase.auth.signOut(); } catch { /* ignore */ }
                setSession(null);
                onLogout();
              }}
              className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2.5 rounded-xl transition-colors"
            >
              Şimdi Çık
            </button>
          </div>
        </div>
      )}
      {/* Header */}
      <div className="bg-gradient-to-r from-orange-600 to-red-600 text-white">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="min-w-0">
            <h1 className="text-lg md:text-xl font-bold truncate">
              Garson: <span className="font-black">{session.name}</span>
            </h1>
            <p className="text-orange-100 text-xs md:text-sm truncate">{session.phone}</p>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors font-semibold text-sm"
          >
            <LogOut className="w-4 h-4" />
            Çıkış
          </button>
        </div>
      </div>

      {/* Main Content */}
      {!showOrderPanel ? (
        <div className="max-w-7xl mx-auto px-4 py-8">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-4 border-orange-200 border-t-orange-600 rounded-full animate-spin" />
            </div>
          ) : (
            <div className="space-y-6">
              {/* Group Tabs */}
              <div className="flex gap-3 overflow-x-auto pb-2">
                {tableGroups.map(group => (
                  <button
                    key={group.id}
                    onClick={() => setSelectedGroupId(group.id)}
                    className={`px-6 py-3 rounded-lg font-semibold transition-colors whitespace-nowrap ${
                      selectedGroupId === group.id
                        ? 'bg-orange-600 text-white'
                        : 'bg-slate-700 text-slate-200 hover:bg-slate-600'
                    }`}
                  >
                    {group.name} ({group.tables.length})
                  </button>
                ))}
              </div>

              {/* Tables Grid */}
              {currentGroup && (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3 md:gap-4">
                  {currentGroup.tables.map(table => (
                    <button
                      key={table.id}
                      onClick={() => handleTableClick(table)}
                      className={`aspect-square rounded-2xl font-black text-white transition-all transform hover:scale-[1.02] shadow-lg hover:shadow-xl flex flex-col items-center justify-center ${
                        table.status === 'occupied'
                          ? 'bg-orange-600 hover:bg-orange-700'
                          : table.status === 'reserved'
                          ? 'bg-yellow-600 hover:bg-yellow-700'
                          : table.status === 'dirty'
                          ? 'bg-red-600 hover:bg-red-700'
                          : 'bg-emerald-600 hover:bg-emerald-700'
                      }`}
                    >
                      <div className="text-sm opacity-80">{currentGroup.prefix}</div>
                      <div className="text-3xl">{table.table_number}</div>
                      {table.status === 'occupied' && (
                        <div className="text-xs mt-1 opacity-80">Dolu</div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        /* Order Panel */
        <div className="max-w-7xl mx-auto px-4 py-6">
          <button
            onClick={() => {
              setShowOrderPanel(false);
              setSelectedTable(null);
              setCart([]);
            }}
            className="text-slate-600 hover:text-orange-600 transition-colors font-semibold mb-6 flex items-center gap-2"
          >
            ← Masalara Dön
          </button>

          <div className="grid grid-cols-1 gap-6 pb-28">
            <div className="space-y-4">
              <div className="bg-white rounded-lg p-4">
                <h2 className="text-xl font-bold text-slate-900 mb-4">
                  Masa {selectedTable?.table_number} Sipariş Oluştur
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                      placeholder="Ürün ara..."
                      className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-400 text-sm"
                    />
                  </div>
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                    {[1,2,3,4,5,6,7,8,9,10].map(n => (
                      <button
                        key={n}
                        onClick={() => setQtyMultiplier(n)}
                        className={`min-w-8 h-8 rounded-md text-xs font-bold border ${qtyMultiplier === n ? 'bg-orange-600 text-white border-orange-600' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
                      >
                        x{n}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Categories */}
                <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
                  {categories.length === 0 ? (
                    <div className="flex items-center gap-2 text-sm text-slate-500 px-2">
                      <span>Kategori bulunamadı</span>
                      <button
                        onClick={() => session && loadProducts(session.tenant_id)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold"
                      >
                        <RefreshCw className="w-3 h-3" />
                        Yenile
                      </button>
                    </div>
                  ) : (
                    <>
                      <button
                        onClick={() => setSelectedCategory('__all__')}
                        className={`px-4 py-2 rounded-lg font-semibold whitespace-nowrap transition-colors ${
                          selectedCategory === '__all__'
                            ? 'bg-orange-600 text-white'
                            : 'bg-slate-100 text-slate-900 hover:bg-slate-200'
                        }`}
                      >
                        Tümü
                      </button>
                      {categories.map(cat => (
                        <button
                          key={cat.id}
                          onClick={() => setSelectedCategory(cat.id)}
                          className={`px-4 py-2 rounded-lg font-semibold whitespace-nowrap transition-colors ${
                            selectedCategory === cat.id
                              ? 'bg-orange-600 text-white'
                              : 'bg-slate-100 text-slate-900 hover:bg-slate-200'
                          }`}
                        >
                          {cat.name}
                        </button>
                      ))}
                    </>
                  )}
                </div>

                {/* Products Grid */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {filteredProducts.length === 0 ? (
                    <div className="col-span-full text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-4">
                      Bu kategoride ürün bulunamadı.
                    </div>
                  ) : (
                    filteredProducts.map(product => (
                      <button
                        key={product.id}
                        onClick={() => handleAddToCart(product)}
                        className="p-3 bg-slate-50 hover:bg-orange-50 border border-slate-200 rounded-lg transition-colors text-left"
                      >
                        <div className="font-semibold text-slate-900 text-sm line-clamp-2">
                          {product.name}
                        </div>
                        <div className="text-orange-600 font-bold mt-2">
                          {product.price.toLocaleString('tr-TR')} ₺
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>

              {selectedTable?.current_order_id && (
                <div className="bg-white rounded-lg p-4 border border-slate-200">
                  <div className="flex items-center gap-2 mb-3">
                    <ArrowRightLeft className="w-4 h-4 text-orange-600" />
                    <h3 className="font-bold text-slate-800">Masa Taşıma</h3>
                  </div>
                  <div className="flex flex-col md:flex-row gap-2">
                    <select
                      value={moveTargetTableId}
                      onChange={(e) => setMoveTargetTableId(e.target.value)}
                      className="flex-1 px-3 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-400 text-sm"
                    >
                      <option value="">Hedef boş masa seçin</option>
                      {moveCandidates.map(t => (
                        <option key={t.id} value={t.id}>Masa {t.table_number}</option>
                      ))}
                    </select>
                    <button
                      onClick={handleMoveTable}
                      className="px-4 py-2.5 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold"
                    >
                      Taşı
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <button
            onClick={() => setCartOpen(true)}
            className="fixed bottom-4 right-4 z-40 bg-orange-600 hover:bg-orange-700 text-white rounded-full shadow-xl px-4 py-3 flex items-center gap-2"
          >
            <ShoppingCart className="w-5 h-5" />
            <span className="font-bold text-sm">{cart.length} ürün • {cartTotal.toLocaleString('tr-TR')} ₺</span>
          </button>

          {cartOpen && (
            <div className="fixed inset-0 z-50">
              <div className="absolute inset-0 bg-black/40" onClick={() => setCartOpen(false)} />
              <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-2xl max-h-[78vh] overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                  <h3 className="text-lg font-bold text-slate-900">Sepet</h3>
                  <button onClick={() => setCartOpen(false)} className="p-2 rounded-lg hover:bg-slate-100">
                    <X className="w-5 h-5 text-slate-600" />
                  </button>
                </div>
                <div className="p-4 overflow-y-auto max-h-[52vh]">
                  <div className="bg-white rounded-lg p-4 h-fit">
              <h3 className="text-lg font-bold text-slate-900 mb-4">Sepet</h3>

              {cart.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  <ShoppingCart className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Sepet boş</p>
                </div>
              ) : (
                <>
                  <div className="space-y-3 mb-4 max-h-96 overflow-y-auto">
                    {cart.map(item => (
                      <div key={item.product.id} className="bg-slate-50 p-3 rounded-lg">
                        <div className="flex justify-between items-start mb-2">
                          <div className="font-semibold text-slate-900 text-sm">
                            {item.product.name}
                          </div>
                          <button
                            onClick={() => handleRemoveFromCart(item.product.id)}
                            className="text-red-600 hover:text-red-700"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleQuantityChange(item.product.id, item.quantity - 1)}
                              className="w-6 h-6 bg-slate-200 rounded flex items-center justify-center hover:bg-slate-300"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="w-8 text-center font-semibold">{item.quantity}</span>
                            <button
                              onClick={() => handleQuantityChange(item.product.id, item.quantity + 1)}
                              className="w-6 h-6 bg-slate-200 rounded flex items-center justify-center hover:bg-slate-300"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                          <div className="font-bold text-slate-900">
                            {(item.product.price * item.quantity).toLocaleString('tr-TR')} ₺
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="border-t pt-4 space-y-3">
                    <div className="flex justify-between items-center font-bold text-lg text-slate-900">
                      <span>Toplam:</span>
                      <span>{cartTotal.toLocaleString('tr-TR')} ₺</span>
                    </div>
                    <button
                      onClick={handleCreateOrder}
                      disabled={orderLoading}
                      className="w-full bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 disabled:bg-slate-400 text-white font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
                    >
                      {orderLoading ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Sipariş Oluşturuluyor...
                        </>
                      ) : (
                        <>
                          <Check className="w-5 h-5" />
                          Sipariş Oluştur
                        </>
                      )}
                    </button>
                  </div>
                </>
              )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
