import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { LogOut, ChevronDown, Plus, Minus, Trash2, Check, X, AlertCircle, ShoppingCart } from 'lucide-react';

interface WaiterSession {
  id: string;
  name: string;
  phone: string;
  tenant_id: string;
  loginTime: string;
}

interface RestaurantTable {
  id: string;
  table_number: number;
  status: 'available' | 'occupied' | 'reserved' | 'dirty';
  current_order_id: string | null;
  group_id: string;
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
  category_id: string;
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
  const [cart, setCart] = useState<CartItem[]>([]);
  const [orderLoading, setOrderLoading] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('waiter_session');
    if (saved) {
      const waiterSession = JSON.parse(saved);
      setSession(waiterSession);
      loadTableGroups(waiterSession.tenant_id);
    }
  }, []);

  const loadTableGroups = async (tenantId: string) => {
    try {
      const { data: tables, error } = await supabase
        .from('restaurant_tables')
        .select('id, table_number, status, current_order_id, group_id, table_groups(id, name, prefix)')
        .eq('tenant_id', tenantId)
        .order('table_number');

      if (error) throw error;

      const grouped = new Map<string, TableGroup>();
      tables?.forEach((table: any) => {
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

  const loadProducts = async (tenantId: string) => {
    try {
      const { data: cats, error: catError } = await supabase
        .from('categories')
        .select('id, name')
        .eq('tenant_id', tenantId)
        .order('display_order');

      if (catError) throw catError;
      setCategories(cats || []);

      const { data: prods, error: prodError } = await supabase
        .from('products')
        .select('id, name, price, category_id')
        .eq('tenant_id', tenantId)
        .eq('is_active', true);

      if (prodError) throw prodError;
      setProducts(prods || []);

      if (cats && cats.length > 0) {
        setSelectedCategory(cats[0].id);
      }
    } catch (err) {
      console.error('Ürün yükleme hatası:', err);
    }
  };

  const handleTableClick = (table: RestaurantTable) => {
    setSelectedTable(table);
    setShowOrderPanel(true);
    if (!products.length && session) {
      loadProducts(session.tenant_id);
    }
  };

  const handleAddToCart = (product: Product) => {
    const existingItem = cart.find(item => item.product.id === product.id);
    if (existingItem) {
      setCart(cart.map(item =>
        item.product.id === product.id
          ? { ...item, quantity: item.quantity + 1 }
          : item
      ));
    } else {
      setCart([...cart, { product, quantity: 1 }]);
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
          branch_id: selectedTable.id, // Will need to get actual branch_id
          status: 'open',
          payment_status: 'unpaid',
          total_price: cart.reduce((sum, item) => sum + (item.product.price * item.quantity), 0),
          order_type: 'dine_in',
          user_id: session.id,
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
      loadTableGroups(session.tenant_id);
    } catch (err: any) {
      console.error('Sipariş oluşturma hatası:', err);
      alert(err.message || 'Sipariş oluşturulamadı');
    } finally {
      setOrderLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('waiter_session');
    onLogout();
  };

  const currentGroup = tableGroups.find(g => g.id === selectedGroupId);
  const filteredProducts = selectedCategory
    ? products.filter(p => p.category_id === selectedCategory)
    : products;

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

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Header */}
      <div className="bg-gradient-to-r from-orange-600 to-red-600 text-white">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{session.name}</h1>
            <p className="text-orange-100 text-sm">{session.phone}</p>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors"
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
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4">
                  {currentGroup.tables.map(table => (
                    <button
                      key={table.id}
                      onClick={() => handleTableClick(table)}
                      className={`aspect-square rounded-lg font-bold text-white transition-all transform hover:scale-105 flex flex-col items-center justify-center ${
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
        <div className="max-w-7xl mx-auto px-4 py-8">
          <button
            onClick={() => {
              setShowOrderPanel(false);
              setSelectedTable(null);
              setCart([]);
            }}
            className="text-white hover:text-orange-400 transition-colors font-semibold mb-6 flex items-center gap-2"
          >
            ← Masalara Dön
          </button>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Products */}
            <div className="lg:col-span-2 space-y-4">
              <div className="bg-white rounded-lg p-4">
                <h2 className="text-xl font-bold text-slate-900 mb-4">
                  Masa {selectedTable?.table_number} Sipariş Oluştur
                </h2>

                {/* Categories */}
                <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
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
                </div>

                {/* Products Grid */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {filteredProducts.map(product => (
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
                  ))}
                </div>
              </div>
            </div>

            {/* Cart */}
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
                      className="w-full bg-orange-600 hover:bg-orange-700 disabled:bg-slate-400 text-white font-bold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
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
      )}
    </div>
  );
}
