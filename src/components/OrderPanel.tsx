import { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from 'react';
import { flushSync } from 'react-dom';
import { useShallow } from 'zustand/react/shallow';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Database } from '../lib/supabase';
import { X, Plus, Minus, ShoppingCart, Trash2, Search, ChevronUp, ChevronDown, AlertCircle, Printer, Banknote, CreditCard, Receipt, ZoomIn, ZoomOut, MessageSquare, Scale, ArrowRightLeft, Check, Combine } from 'lucide-react';
import { PaymentModal } from './PaymentModal';
import { ScaleWeighingModal } from './ScaleWeighingModal';
import { loadPrintSettings, printKitchenReceipts, printHtml, buildReceiptHtml, printTakeawayReceipt } from '../lib/printService';
import { sendSaleToHugin } from '../lib/huginTps';
import { queryCache } from '../lib/queryCache';
import { useOrderSessionStore } from '../stores/orderSessionStore';
import type { CartItem, ProductVariant } from '../types/posOrder';
import type { PaymentTransactionRow } from '../stores/orderSessionStore';
import {
  buildOptimisticOrderItem,
  buildGridSnapshotPlaceholderOrder,
  buildPlaceholderOrder,
  isTempLineId,
  isTempOrderId,
  ORDER_ITEMS_PANEL_SELECT,
  TEMP_LINE_PREFIX,
  TEMP_ORDER_PREFIX,
} from '../lib/orderOptimistic';
import { runWithRetry } from '../lib/outboundQueue';
import {
  peekWarmOrderItems,
  takeWarmOrderItems,
  readPersistedOrderItemsSnapshot,
  persistOrderItemsSnapshot,
  warmOrderItemsForPanel,
} from '../lib/orderPanelWarm';

/** 767px eşiğinde scrollbar/DPI kayması mobil↔masaüstü düzeni gidip getiriyordu (özellikle Electron). Ölü bant ile sabitlenir. */
const ORDER_PANEL_MOBILE_MAX_PX = 767;
const ORDER_PANEL_DESKTOP_MIN_PX = 800;

function orderPanelMobileFromWidth(prev: boolean, width: number): boolean {
  if (width <= ORDER_PANEL_MOBILE_MAX_PX) return true;
  if (width >= ORDER_PANEL_DESKTOP_MIN_PX) return false;
  return prev;
}

interface ScaleBarcodeResult {
  pluCode: string;
  weightGrams: number | null;
  priceAmount: number | null;
  type: 'weight' | 'price';
}

function parseScaleBarcode(barcode: string): ScaleBarcodeResult | null {
  const clean = barcode.replace(/[^0-9]/g, '');
  if (clean.length !== 13) return null;
  const prefix = clean.substring(0, 2);
  if (!['27', '28', '29'].includes(prefix)) return null;

  const pluCode = clean.substring(2, 7);
  const valueStr = clean.substring(7, 12);
  const value = parseInt(valueStr, 10);

  if (prefix === '29') {
    return { pluCode, weightGrams: null, priceAmount: value / 100, type: 'price' };
  } else {
    return { pluCode, weightGrams: value, priceAmount: null, type: 'weight' };
  }
}

type Table = Database['public']['Tables']['restaurant_tables']['Row'];
type TableGroupRow = Pick<Database['public']['Tables']['table_groups']['Row'], 'id' | 'name' | 'color' | 'branch_id' | 'prefix'>;
type TableWithGridOrder = Table & {
  order?: { id: string; total_amount: number; order_number: string; payment_status?: string | null };
};
type Product = Database['public']['Tables']['products']['Row'];
type Category = Database['public']['Tables']['categories']['Row'];
type Order = Database['public']['Tables']['orders']['Row'];
type OrderItem = Database['public']['Tables']['order_items']['Row'];
type PaymentTransaction = PaymentTransactionRow;

interface OrderPanelProps {
  table: TableWithGridOrder;
  onClose: () => void;
  /** Birleştirmede tıklanan hedef masaya geçilir (birleşik sipariş orada kalır) */
  onAfterMergeNavigate?: (destination: TableWithGridOrder) => void;
}

type PaymentMethod = 'cash' | 'credit_card' | 'open_account';

interface DesktopCategoryColumnProps {
  categories: Category[];
  selectedCategory: string | null;
  onSelectCategory: (id: string) => void;
  onReorder: (reordered: Category[]) => void;
}

function DesktopCategoryColumn({ categories, selectedCategory, onSelectCategory, onReorder }: DesktopCategoryColumnProps) {
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragItemRef = useRef<number | null>(null);

  const handleDragStart = (index: number) => {
    dragItemRef.current = index;
    setDraggingIndex(index);
  };

  const handleDragEnter = (index: number) => {
    setDragOverIndex(index);
  };

  const handleDragEnd = () => {
    if (dragItemRef.current !== null && dragOverIndex !== null && dragItemRef.current !== dragOverIndex) {
      const reordered = [...categories];
      const [moved] = reordered.splice(dragItemRef.current, 1);
      reordered.splice(dragOverIndex, 0, moved);
      onReorder(reordered);
    }
    setDraggingIndex(null);
    setDragOverIndex(null);
    dragItemRef.current = null;
  };

  return (
    <div className="w-36 lg:w-44 bg-white border-l border-r flex flex-col shrink-0 overflow-hidden">
      <div className="flex-1 overflow-y-auto py-2 space-y-1.5 px-2">
        {categories.map((category, index) => (
          <div
            key={category.id}
            draggable
            onDragStart={() => handleDragStart(index)}
            onDragEnter={() => handleDragEnter(index)}
            onDragOver={e => e.preventDefault()}
            onDragEnd={handleDragEnd}
            onClick={() => onSelectCategory(category.id)}
            className={`w-full px-2 py-3.5 rounded-none font-bold text-sm text-center cursor-pointer select-none transition-all active:scale-95 ${
              selectedCategory === category.id
                ? 'text-white shadow-md'
                : 'bg-orange-50 text-slate-700 hover:bg-orange-100'
            } ${draggingIndex === index ? 'opacity-40' : ''} ${dragOverIndex === index && draggingIndex !== index ? 'ring-2 ring-orange-400 scale-105' : ''}`}
            style={{
              backgroundColor: selectedCategory === category.id ? category.color : undefined,
              cursor: 'grab',
            }}
          >
            <span className="leading-tight block">{category.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TableGroupPickerChips({
  groups,
  selectedId,
  onSelect,
  accent,
}: {
  groups: TableGroupRow[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  accent: 'orange' | 'violet';
}) {
  if (groups.length === 0) return null;
  const allActive = selectedId === null;
  const allCls =
    accent === 'orange'
      ? allActive
        ? 'border-orange-600 bg-orange-500 text-white'
        : 'border-slate-200 bg-slate-50 text-slate-700'
      : allActive
        ? 'border-violet-600 bg-violet-600 text-white'
        : 'border-slate-200 bg-slate-50 text-slate-700';
  return (
    <div
      className="flex gap-2 overflow-x-auto pb-3 mb-2 scrollbar-hide"
      style={{ WebkitOverflowScrolling: 'touch' as any }}
    >
      <button type="button" onClick={() => onSelect(null)} className={`shrink-0 px-3 py-2 rounded-xl text-sm font-black border-2 transition-all ${allCls}`}>
        Tümü
      </button>
      {groups.map((g) => {
        const active = selectedId === g.id;
        return (
          <button
            key={g.id}
            type="button"
            onClick={() => onSelect(g.id)}
            className={`shrink-0 px-3 py-2 rounded-xl text-sm font-black border-2 transition-all text-white ${
              active ? 'ring-2 ring-offset-1 ring-slate-900/25' : 'opacity-90'
            }`}
            style={{
              backgroundColor: g.color || (accent === 'orange' ? '#ea580c' : '#7c3aed'),
              borderColor: active ? (g.color || undefined) : 'transparent',
            }}
          >
            {g.name}
          </button>
        );
      })}
    </div>
  );
}

export function OrderPanel({ table, onClose, onAfterMergeNavigate }: OrderPanelProps) {
  const { tenant, user, profile, permissions, activeBranch } = useAuth();
  const detectMobileViewport = useCallback(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth <= ORDER_PANEL_MOBILE_MAX_PX;
  }, []);
  const {
    cart,
    setCart,
    currentOrder,
    setCurrentOrder,
    existingOrderItems,
    setExistingOrderItems,
    paymentTransactions,
    setPaymentTransactions,
    resetOrderSession,
  } = useOrderSessionStore(
    useShallow((s) => ({
      cart: s.cart,
      setCart: s.setCart,
      currentOrder: s.currentOrder,
      setCurrentOrder: s.setCurrentOrder,
      existingOrderItems: s.existingOrderItems,
      setExistingOrderItems: s.setExistingOrderItems,
      paymentTransactions: s.paymentTransactions,
      setPaymentTransactions: s.setPaymentTransactions,
      resetOrderSession: s.resetOrderSession,
    }))
  );
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showPayment, setShowPayment] = useState(false);
  const [payOpening, setPayOpening] = useState(false);
  const [discount, setDiscount] = useState(0);
  const [productVariants, setProductVariants] = useState<ProductVariant[]>([]);
  const [selectedProductForVariant, setSelectedProductForVariant] = useState<Product | null>(null);
  const [quantityMultiplier, setQuantityMultiplier] = useState(1);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [barcodeInputValue, setBarcodeInputValue] = useState('');
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const [cancelReasonModal, setCancelReasonModal] = useState<{
    type: 'item' | 'existing';
    id: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    variantId?: string;
  } | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [requireCancelReason, setRequireCancelReason] = useState(false);
  const [noteModal, setNoteModal] = useState<{ productId: string; variantId?: string; currentNote: string } | null>(null);
  const [noteInput, setNoteInput] = useState('');
  const [existingItemNoteModal, setExistingItemNoteModal] = useState<{ itemId: string; currentNote: string } | null>(null);
  const [existingNoteInput, setExistingNoteInput] = useState('');
  const [productGridSize, setProductGridSize] = useState<number>(() => {
    const saved = localStorage.getItem('productGridSize');
    return saved ? parseInt(saved) : 4;
  });
  const [scaleBarcodeModal, setScaleBarcodeModal] = useState<{
    product: Product;
    parsed: ScaleBarcodeResult;
    calculatedPrice: number;
    calculatedQty: number;
  } | null>(null);
  const [paymentLockedWarning, setPaymentLockedWarning] = useState(false);
  const [showTableTransfer, setShowTableTransfer] = useState(false);
  const [availableTables, setAvailableTables] = useState<Table[]>([]);
  const [transferring, setTransferring] = useState(false);
  const [showTableMerge, setShowTableMerge] = useState(false);
  const [mergeCandidates, setMergeCandidates] = useState<Table[]>([]);
  const [mergeGroups, setMergeGroups] = useState<TableGroupRow[]>([]);
  const [mergeFilterGroupId, setMergeFilterGroupId] = useState<string | null>(null);
  const [transferGroups, setTransferGroups] = useState<TableGroupRow[]>([]);
  const [transferFilterGroupId, setTransferFilterGroupId] = useState<string | null>(null);
  const [merging, setMerging] = useState(false);
  const barcodeBufferRef = useRef('');
  const barcodeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const submittingRef = useRef(false);
  const [submitBusy, setSubmitBusy] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const saveOrderTotalTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveItemQuantityTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const [scalePort, setScalePort] = useState<string>(() => {
    try {
      const raw = localStorage.getItem('scale_calibration');
      if (raw) {
        const j = JSON.parse(raw);
        if (typeof j.port === 'string' && j.port) return j.port;
      }
    } catch { /* ignore */ }
    return 'COM1';
  });
  const [scaleBaudRate, setScaleBaudRate] = useState(() => {
    try {
      const raw = localStorage.getItem('scale_calibration');
      if (raw) {
        const br = parseInt(String(JSON.parse(raw).baudRate || '9600'), 10);
        if (Number.isFinite(br) && br > 0) return br;
      }
    } catch { /* ignore */ }
    return 9600;
  });
  const [scaleListening, setScaleListening] = useState(false);
  const [availablePorts, setAvailablePorts] = useState<any[]>([]);
  const [isMobileViewport, setIsMobileViewport] = useState<boolean>(() => detectMobileViewport());

  useEffect(() => {
    try {
      const raw = localStorage.getItem('scale_calibration');
      if (!raw) return;
      const j = JSON.parse(raw);
      if (typeof j.port === 'string' && j.port) setScalePort(j.port);
      const br = parseInt(String(j.baudRate || '9600'), 10);
      if (Number.isFinite(br) && br > 0) setScaleBaudRate(br);
    } catch { /* ignore */ }
  }, [table.id, tenant?.id]);

  const emitTableStateChanged = useCallback((detail: Partial<TableWithGridOrder> & { id: string }) => {
    window.dispatchEvent(new CustomEvent('sefpos:table-state-changed', { detail }));
  }, []);
  const [scaleWeighingProduct, setScaleWeighingProduct] = useState<Product | null>(null);

  const [orderHydrating, setOrderHydrating] = useState(false);

  useLayoutEffect(() => {
    resetOrderSession();
    if (!tenant?.id) return;
    const oid = table.current_order_id;
    if (!oid) {
      setOrderHydrating(false);
      return;
    }
    setOrderHydrating(true);
    const embed = table.order?.id === oid ? table.order : undefined;
    setCurrentOrder(
      buildGridSnapshotPlaceholderOrder({
        orderId: oid,
        tenantId: tenant.id,
        branchId: activeBranch?.id ?? null,
        restaurantTableId: table.id,
        tableNumber: table.table_number,
        waiterId: user?.id ?? null,
        embed: embed ?? null,
      })
    );
    const earlyLines = peekWarmOrderItems(oid);
    if (earlyLines !== null) {
      setExistingOrderItems(earlyLines);
      setOrderHydrating(false);
    } else {
      const persisted = readPersistedOrderItemsSnapshot(oid);
      if (persisted !== null) {
        setExistingOrderItems(persisted);
        setOrderHydrating(false);
      }
    }
  }, [
    resetOrderSession,
    setCurrentOrder,
    tenant?.id,
    activeBranch?.id,
    user?.id,
    table.id,
    table.current_order_id,
    table.table_number,
    table.order?.id,
    table.order?.total_amount,
    table.order?.order_number,
    table.order?.payment_status,
    setExistingOrderItems,
  ]);

  const changeGridSize = (delta: number) => {
    setProductGridSize(prev => {
      const next = Math.min(8, Math.max(2, prev + delta));
      localStorage.setItem('productGridSize', String(next));
      return next;
    });
  };

  const lockTableForPayment = async (): Promise<boolean> => {
    if (table.table_number === 0 || !table.id) return true;
    const { data } = await supabase
      .from('restaurant_tables')
      .select('payment_locked, payment_locked_at')
      .eq('id', table.id)
      .maybeSingle();

    if (data?.payment_locked) {
      const lockedAt = data.payment_locked_at ? new Date(data.payment_locked_at).getTime() : 0;
      const staleMs = 10 * 60 * 1000;
      const isStale = Date.now() - lockedAt > staleMs;
      if (isStale) {
        await supabase.from('restaurant_tables').update({ payment_locked: false, payment_locked_at: null }).eq('id', table.id);
        emitTableStateChanged({ id: table.id, payment_locked: false });
      } else {
        setPaymentLockedWarning(true);
        return false;
      }
    }
    await supabase.from('restaurant_tables').update({ payment_locked: true, payment_locked_at: new Date().toISOString() }).eq('id', table.id);
    emitTableStateChanged({ id: table.id, payment_locked: true });
    return true;
  };

  const unlockTable = async () => {
    if (table.table_number === 0 || !table.id) return;
    await supabase.from('restaurant_tables').update({ payment_locked: false, payment_locked_at: null }).eq('id', table.id);
    emitTableStateChanged({ id: table.id, payment_locked: false });
  };

  const applyOrderStockMovements = useCallback(async (orderId: string, items: (OrderItem & { products: Product })[]) => {
    if (!tenant) return;

    const branchId = (table as any).branch_id || activeBranch?.id || null;
    const qtyByProduct = new Map<string, number>();
    const productById = new Map<string, Product>();

    items.forEach((item) => {
      const qty = Number(item.quantity || 0);
      if (!item.product_id || qty <= 0) return;
      qtyByProduct.set(item.product_id, (qtyByProduct.get(item.product_id) || 0) + qty);
      if ((item as any).products) productById.set(item.product_id, (item as any).products);
    });

    for (const [productId, qty] of qtyByProduct.entries()) {
      const { data: existingMove } = await supabase
        .from('stock_movements')
        .select('id')
        .eq('tenant_id', tenant.id)
        .eq('product_id', productId)
        .eq('reference_type', 'sale_order')
        .eq('reference_no', orderId)
        .maybeSingle();
      if (existingMove?.id) continue;

      const { data: productRow } = await supabase
        .from('products')
        .select('id, stock_quantity, cost')
        .eq('id', productId)
        .eq('tenant_id', tenant.id)
        .maybeSingle();

      if (productRow?.id) {
        const current = Number((productRow as any).stock_quantity || 0);
        const next = Math.max(0, current - qty);
        await supabase
          .from('products')
          .update({ stock_quantity: next })
          .eq('id', productId)
          .eq('tenant_id', tenant.id);
      }

      if (branchId) {
        const { data: branchStock } = await supabase
          .from('branch_product_stocks')
          .select('quantity')
          .eq('tenant_id', tenant.id)
          .eq('branch_id', branchId)
          .eq('product_id', productId)
          .maybeSingle();
        const currentBranchQty = Number((branchStock as any)?.quantity || 0);
        const nextBranchQty = Math.max(0, currentBranchQty - qty);
        await supabase
          .from('branch_product_stocks')
          .upsert({
            tenant_id: tenant.id,
            branch_id: branchId,
            product_id: productId,
            quantity: nextBranchQty,
          }, { onConflict: 'tenant_id,branch_id,product_id' });
      }

      const p = productById.get(productId);
      const unitCost = Number((productRow as any)?.cost ?? p?.cost ?? 0);
      await supabase.from('stock_movements').insert({
        tenant_id: tenant.id,
        product_id: productId,
        movement_type: 'out',
        quantity: qty,
        unit_cost: unitCost,
        total_cost: Number((unitCost * qty).toFixed(2)),
        source_branch_id: branchId,
        reference_type: 'sale_order',
        reference_no: orderId,
        note: `Satis siparisi #${(currentOrder as any)?.order_number || ''}`,
      } as any);
    }
  }, [tenant?.id, table?.id, (table as any)?.branch_id, activeBranch?.id, currentOrder?.id, (currentOrder as any)?.order_number]);

  const openTableTransfer = async () => {
    if (!tenant || !currentOrder) return;
    const branchId = activeBranch?.id || (table as any).branch_id;
    let tableQ = supabase
      .from('restaurant_tables')
      .select('id, table_number, status, group_id, branch_id, current_order_id, session_start, capacity, size, payment_locked, created_at')
      .eq('tenant_id', tenant.id)
      .eq('status', 'available');
    if (branchId) tableQ = tableQ.eq('branch_id', branchId);

    let groupQ = supabase.from('table_groups').select('id, name, color, branch_id, prefix').eq('tenant_id', tenant.id).order('name');
    if (branchId) {
      groupQ = groupQ.or(`branch_id.eq.${branchId},branch_id.is.null`);
    }

    const [tablesRes, groupsRes] = await Promise.all([tableQ.order('table_number'), groupQ]);

    setAvailableTables((tablesRes.data || []) as Table[]);
    setTransferGroups((groupsRes.data || []) as TableGroupRow[]);
    setTransferFilterGroupId(null);
    setShowTableTransfer(true);
  };

  const handleTableTransfer = async (targetTable: Table) => {
    if (!currentOrder || !tenant || transferring) return;
    setTransferring(true);
    try {
      await supabase
        .from('orders')
        .update({ table_id: targetTable.id } as any)
        .eq('id', currentOrder.id);

      await supabase
        .from('restaurant_tables')
        .update({
          status: 'occupied',
          current_order_id: currentOrder.id,
          session_start: table.session_start || new Date().toISOString(),
          payment_locked: false,
        })
        .eq('id', targetTable.id);

      await supabase
        .from('restaurant_tables')
        .update({
          status: 'available',
          current_order_id: null,
          session_start: null,
          payment_locked: false,
        })
        .eq('id', table.id);

      setShowTableTransfer(false);
      onClose();
    } catch (err: any) {
      alert('Masa taşıma başarısız: ' + err.message);
    } finally {
      setTransferring(false);
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let raf = 0;
    const commit = () => {
      const w = window.innerWidth;
      setIsMobileViewport((prev) => orderPanelMobileFromWidth(prev, w));
    };
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(commit);
    };
    commit();
    window.addEventListener('resize', schedule, { passive: true });
    const vv = window.visualViewport;
    if (vv) vv.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', schedule);
      if (vv) vv.removeEventListener('resize', schedule);
    };
  }, []);

  useEffect(() => {
    if (table.id && table.table_number !== 0) {
      supabase.from('restaurant_tables')
        .update({ payment_locked: false, payment_locked_at: null })
        .eq('id', table.id);
    }
    return () => {
      if (table.id && table.table_number !== 0) {
        supabase.from('restaurant_tables')
          .update({ payment_locked: false, payment_locked_at: null })
          .eq('id', table.id);
      }
    };
  }, [table.id]);

  const loadMenuData = useCallback(async (forceRefresh = false) => {
    if (!tenant) return;

    const applyMenu = (productsData: any[], categoriesData: any[], variantData: any[]) => {
      setProducts(productsData as any);
      setCategories(categoriesData as any);
      setProductVariants(variantData as any);
      setSelectedCategory((prev) => {
        if (prev && categoriesData.some((c: any) => c.id === prev)) return prev;
        return categoriesData[0]?.id ?? null;
      });
    };

    if (!forceRefresh) {
      const snap = queryCache.peekProductsAndCategories(tenant.id, activeBranch?.id || undefined);
      if (snap) {
        applyMenu(snap.products as any, snap.categories as any, snap.productVariants as any);
        void queryCache
          .getProductsAndCategories(tenant.id, activeBranch?.id || undefined, false)
          .then(({ products, categories, productVariants }) => {
            applyMenu(products as any, categories as any, productVariants as any);
          })
          .catch((error) => console.error('OrderPanel menu load error:', error));
        return;
      }
    }

    try {
      const { products: productsData, categories: categoriesData, productVariants: variantData } =
        await queryCache.getProductsAndCategories(tenant.id, activeBranch?.id || undefined, forceRefresh);
      applyMenu(productsData as any, categoriesData as any, variantData as any);
    } catch (error) {
      console.error('OrderPanel menu load error:', error);
    }
  }, [tenant?.id, activeBranch?.id]);

  useEffect(() => {
    if (!tenant) return;
    supabase.from('tenants').select('require_cancel_reason').eq('id', tenant.id).maybeSingle().then(({ data }) => {
      if (data) setRequireCancelReason(!!(data as any).require_cancel_reason);
    });
  }, [tenant?.id]);

  const processBarcodeString = useCallback((barcode: string) => {
    const clean = barcode.trim();
    if (!clean) return;

    const parsed = parseScaleBarcode(clean);
    if (parsed) {
      const matchProduct = products.find(p =>
        p.barcode && (
          p.barcode === parsed.pluCode ||
          p.barcode.slice(2, 7) === parsed.pluCode ||
          p.barcode === clean
        )
      );
      if (matchProduct) {
        let calculatedPrice = matchProduct.price;
        if (parsed.type === 'weight' && parsed.weightGrams != null) {
          calculatedPrice = parseFloat(((matchProduct.price / 1000) * parsed.weightGrams).toFixed(2));
        } else if (parsed.type === 'price' && parsed.priceAmount != null) {
          calculatedPrice = parsed.priceAmount;
        }
        setScaleBarcodeModal({ product: matchProduct, parsed, calculatedPrice, calculatedQty: 1 });
        return;
      }
    }

    const exactProduct = products.find(p => p.barcode === clean);
    if (exactProduct) {
      setCart(prev => {
        const existing = prev.findIndex(i => i.product.id === exactProduct.id && !i.variant);
        if (existing >= 0) {
          const next = [...prev];
          next[existing] = { ...next[existing], quantity: next[existing].quantity + 1 };
          return next;
        }
        return [...prev, { product: exactProduct, quantity: 1 }];
      });
    }
  }, [products]);

  const handleBarcodeInputSubmit = useCallback((value: string) => {
    processBarcodeString(value);
    setBarcodeInputValue('');
  }, [processBarcodeString]);

  const handleScaleBarcodeConfirm = useCallback(() => {
    if (!scaleBarcodeModal) return;
    const { product, parsed, calculatedPrice, calculatedQty } = scaleBarcodeModal;
    const weightedProduct: Product = {
      ...product,
      price: calculatedPrice,
      name: parsed.type === 'weight' && parsed.weightGrams != null
        ? `${product.name} (${(parsed.weightGrams / 1000).toFixed(3)} kg)`
        : product.name,
    };
    setCart(prev => [...prev, { product: weightedProduct, quantity: calculatedQty }]);
    setScaleBarcodeModal(null);
  }, [scaleBarcodeModal]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';
      if (isInput && !(target as HTMLInputElement).readOnly) return;

      if (e.key === 'Enter') {
        const barcode = barcodeBufferRef.current.trim();
        barcodeBufferRef.current = '';
        if (barcodeTimerRef.current) clearTimeout(barcodeTimerRef.current);
        if (barcode.length >= 8) processBarcodeString(barcode);
        return;
      }

      if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        barcodeBufferRef.current += e.key;
        if (barcodeTimerRef.current) clearTimeout(barcodeTimerRef.current);
        barcodeTimerRef.current = setTimeout(() => { barcodeBufferRef.current = ''; }, 100);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [processBarcodeString]);

  useEffect(() => {
    const electronAPI = (window as any).electronAPI;
    if (!electronAPI) return;

    const unsubScale = electronAPI?.onScaleBarcode?.((data: { barcode: string; port: string }) => {
      processBarcodeString(data.barcode);
    });

    const unsubError = electronAPI?.onScaleError?.((data: { error: string }) => {
      console.error('Scale error:', data.error);
    });

    return () => {
      unsubScale?.();
      unsubError?.();
    };
  }, [processBarcodeString]);

  useEffect(() => {
    const electronAPI = (window as any).electronAPI;
    if (!electronAPI || !scaleListening) return;

    electronAPI.invokeScale?.('scale-start-listener', { port: scalePort, baudRate: scaleBaudRate })
      .then((res: any) => {
        if (!res.success) console.error('Scale start error:', res.error);
      });

    return () => {
      electronAPI.invokeScale?.('scale-stop-listener');
    };
  }, [scaleListening, scalePort, scaleBaudRate]);

  useEffect(() => {
    if (!tenant || !table) return;

    void loadExistingOrder();

    void loadMenuData();

    let catTimer: ReturnType<typeof setTimeout>;
    let prodTimer: ReturnType<typeof setTimeout>;
    let varTimer: ReturnType<typeof setTimeout>;
    let menuChannel: ReturnType<typeof supabase.channel> | undefined;
    const channelDelay = 0;
    const channelTimer = window.setTimeout(() => {
      menuChannel = supabase
        .channel(`order-panel-menu-${tenant.id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'categories', filter: `tenant_id=eq.${tenant.id}` }, () => {
          clearTimeout(catTimer);
          catTimer = setTimeout(() => {
            queryCache.invalidate('categories', tenant.id);
            void loadMenuData(true);
          }, 2000);
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'products', filter: `tenant_id=eq.${tenant.id}` }, () => {
          clearTimeout(prodTimer);
          prodTimer = setTimeout(() => {
            queryCache.invalidate('products', tenant.id);
            void loadMenuData(true);
          }, 2000);
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'product_variants', filter: `tenant_id=eq.${tenant.id}` }, () => {
          clearTimeout(varTimer);
          varTimer = setTimeout(() => {
            queryCache.invalidate('product_variants', tenant.id);
            void loadMenuData(true);
          }, 2000);
        })
        .subscribe();
    }, channelDelay);

    return () => {
      clearTimeout(channelTimer);
      clearTimeout(catTimer);
      clearTimeout(prodTimer);
      clearTimeout(varTimer);
      if (menuChannel) supabase.removeChannel(menuChannel);
    };
  }, [tenant?.id, table.id, loadMenuData]);

  const loadExistingOrder = async () => {
    if (!tenant) {
      setOrderHydrating(false);
      return;
    }

    const currentOrderId = table.current_order_id;
    if (!currentOrderId) {
      setCurrentOrder(null);
      setExistingOrderItems([]);
      setPaymentTransactions([]);
      setOrderHydrating(false);
      return;
    }

    const warm = takeWarmOrderItems(currentOrderId);
    const usedWarm = !!warm;
    if (warm) {
      setExistingOrderItems(warm.rows);
      persistOrderItemsSnapshot(currentOrderId, warm.rows);
      setOrderHydrating(false);
    }

    const runItems = async () => {
      if (usedWarm) return;
      let r = await supabase.from('order_items').select(ORDER_ITEMS_PANEL_SELECT).eq('order_id', currentOrderId);
      if (r.error) {
        r = await supabase
          .from('order_items')
          .select('*, products(*, categories(*))')
          .eq('order_id', currentOrderId);
      }
      if (r.data) {
        const rows = r.data as any[];
        setExistingOrderItems(rows);
        persistOrderItemsSnapshot(currentOrderId, rows);
      }
    };

    const runOrderAndPayments = async () => {
      const [orderRes, paymentsRes] = await Promise.all([
        supabase.from('orders').select('*').eq('id', currentOrderId).maybeSingle(),
        supabase.from('payment_transactions').select('*').eq('order_id', currentOrderId).order('created_at', { ascending: false }),
      ]);

      if (orderRes.data) {
        setCurrentOrder(orderRes.data);
      } else {
        setCurrentOrder(null);
        setExistingOrderItems([]);
        setPaymentTransactions([]);
      }
      if (paymentsRes.data) setPaymentTransactions(paymentsRes.data as any);
    };

    try {
      await Promise.all([runItems(), runOrderAndPayments()]);
    } finally {
      setOrderHydrating(false);
    }
  };

  const openTableMerge = async () => {
    if (!tenant || !currentOrder) return;
    const branchId = (table as any).branch_id || activeBranch?.id;
    let tableQ = supabase
      .from('restaurant_tables')
      .select('id, table_number, status, group_id, branch_id, current_order_id, session_start, capacity, size, payment_locked, created_at')
      .eq('tenant_id', tenant.id)
      .eq('status', 'occupied')
      .neq('id', table.id)
      .not('current_order_id', 'is', null);
    if (branchId) tableQ = tableQ.eq('branch_id', branchId);

    let groupQ = supabase.from('table_groups').select('id, name, color, branch_id, prefix').eq('tenant_id', tenant.id).order('name');
    if (branchId) {
      groupQ = groupQ.or(`branch_id.eq.${branchId},branch_id.is.null`);
    }

    const [tablesRes, groupsRes] = await Promise.all([tableQ.order('table_number'), groupQ]);

    if (tablesRes.error) {
      alert('Masalar yüklenemedi: ' + tablesRes.error.message);
      return;
    }
    const list = (tablesRes.data || []) as Table[];
    if (list.length === 0) {
      alert('Birleştirilecek başka dolu masa yok.');
      return;
    }
    setMergeCandidates(list);
    setMergeGroups((groupsRes.data || []) as TableGroupRow[]);
    setMergeFilterGroupId(null);
    setShowTableMerge(true);
  };

  const handleTableMerge = async (destinationTable: Table) => {
    if (!currentOrder || !tenant || merging) return;
    /** Paneldeki masa = kaynak sipariş; tıklanan masa = hedef (birleşik sipariş burada kalır) */
    const sourceOrderId = currentOrder.id;
    const targetOrderId = destinationTable.current_order_id;
    const sourceTableId = table.id;
    if (!targetOrderId || !sourceOrderId || targetOrderId === sourceOrderId) return;
    if (destinationTable.id === sourceTableId) return;

    setMerging(true);
    try {
      const { error: payErr } = await supabase
        .from('payment_transactions')
        .update({ order_id: targetOrderId })
        .eq('order_id', sourceOrderId);
      if (payErr) throw payErr;

      const { error: itemsErr } = await supabase
        .from('order_items')
        .update({ order_id: targetOrderId })
        .eq('order_id', sourceOrderId);
      if (itemsErr) throw itemsErr;

      await supabase
        .from('orders')
        .update({ status: 'cancelled', completed_at: new Date().toISOString() })
        .eq('id', sourceOrderId);

      await supabase
        .from('restaurant_tables')
        .update({
          status: 'available',
          current_order_id: null,
          session_start: null,
          payment_locked: false,
        })
        .eq('id', sourceTableId);
      emitTableStateChanged({
        id: sourceTableId,
        status: 'available' as any,
        current_order_id: null,
        session_start: null,
        payment_locked: false,
        order: null,
      });

      const { data: mergedItems } = await supabase
        .from('order_items')
        .select('total_amount')
        .eq('order_id', targetOrderId);
      const subtotal = (mergedItems || []).reduce((s, i) => s + Number((i as any).total_amount || 0), 0);
      const { data: pays } = await supabase
        .from('payment_transactions')
        .select('amount')
        .eq('order_id', targetOrderId);
      const totalPaid = (pays || []).reduce((s, p: any) => s + Number(p.amount), 0);
      const discountAmount = subtotal * (discount / 100);
      const total = subtotal - discountAmount;

      const destPhysicalId = destinationTable.table_number === 0 ? null : destinationTable.id;
      await supabase
        .from('orders')
        .update({
          subtotal,
          tax_amount: 0,
          discount_amount: discountAmount,
          total_amount: total,
          table_id: destPhysicalId,
          payment_status:
            totalPaid >= total - 0.01 ? 'paid' : totalPaid > 0 ? 'partial' : 'unpaid',
        })
        .eq('id', targetOrderId);
      emitTableStateChanged({
        id: destinationTable.id,
        status: 'occupied' as any,
        current_order_id: targetOrderId,
        order: {
          id: targetOrderId,
          total_amount: total,
          order_number: destinationTable.order?.order_number || currentOrder.order_number || '',
          payment_status: totalPaid >= total - 0.01 ? 'paid' : totalPaid > 0 ? 'partial' : 'unpaid',
        },
      });

      const branchId = (table as any).branch_id || activeBranch?.id;
      let destQ = supabase
        .from('restaurant_tables')
        .select(
          `
          id, table_number, status, current_order_id, session_start,
          group_id, tenant_id, branch_id, created_at, capacity, size, payment_locked,
          orders!restaurant_tables_current_order_id_fkey(
            id, total_amount, order_number, payment_status
          )
        `
        )
        .eq('id', destinationTable.id)
        .eq('tenant_id', tenant.id);
      if (branchId) destQ = destQ.eq('branch_id', branchId);
      const { data: destFresh, error: destErr } = await destQ.maybeSingle();

      setShowTableMerge(false);
      setMergeFilterGroupId(null);

      if (destFresh && !destErr) {
        const raw = destFresh as any;
        const { orders: ordEmbed, ...rest } = raw;
        const next: TableWithGridOrder = { ...rest, order: ordEmbed || undefined };
        if (onAfterMergeNavigate) {
          onAfterMergeNavigate(next);
        } else {
          onClose();
        }
      } else {
        if (onAfterMergeNavigate) {
          onAfterMergeNavigate({
            ...destinationTable,
            order: destinationTable.order,
          } as TableWithGridOrder);
        } else {
          onClose();
        }
      }
    } catch (err: any) {
      alert('Masa birleştirme başarısız: ' + (err?.message || String(err)));
    } finally {
      setMerging(false);
    }
  };

  const getCartKey = useCallback((item: CartItem) =>
    item.variant ? `${item.product.id}-${item.variant.id}` : item.product.id
  , []);

  const productHasVariantsSet = useMemo(() => {
    const set = new Set<string>();
    productVariants.forEach((v) => {
      if (v.product_id) set.add(v.product_id);
    });
    return set;
  }, [productVariants]);

  const addToCart = useCallback(async (product: Product, variant?: ProductVariant) => {
    // Check if product requires scale weighing
    if ((product as any).scale_enabled && !variant) {
      setScaleWeighingProduct(product);
      return;
    }

    if (productHasVariantsSet.has(product.id) && !variant) {
      setSelectedProductForVariant(product);
      return;
    }

    const cartKey = variant ? `${product.id}-${variant.id}` : product.id;

    setCart(prev => {
      const existingIdx = prev.findIndex(item =>
        (item.variant ? `${item.product.id}-${item.variant.id}` : item.product.id) === cartKey
      );
      if (existingIdx >= 0) {
        const next = [...prev];
        next[existingIdx] = { ...next[existingIdx], quantity: next[existingIdx].quantity + quantityMultiplier };
        return next;
      }
      return [...prev, { product, variant, quantity: quantityMultiplier }];
    });

    setQuantityMultiplier(1);
  }, [productHasVariantsSet, quantityMultiplier]);

  const removeFromCart = useCallback((productId: string, variantId?: string) => {
    const cartKey = variantId ? `${productId}-${variantId}` : productId;
    setCart(prev => {
      const existingIdx = prev.findIndex(item =>
        (item.variant ? `${item.product.id}-${item.variant.id}` : item.product.id) === cartKey
      );
      if (existingIdx < 0) return prev;
      const item = prev[existingIdx];
      if (item.quantity > 1) {
        const next = [...prev];
        next[existingIdx] = { ...item, quantity: item.quantity - 1 };
        return next;
      }
      return prev.filter((_, i) => i !== existingIdx);
    });
  }, []);

  const deleteFromCart = useCallback((productId: string, variantId?: string) => {
    const cartKey = variantId ? `${productId}-${variantId}` : productId;
    setCart(prev => prev.filter(item =>
      (item.variant ? `${item.product.id}-${item.variant.id}` : item.product.id) !== cartKey
    ));
  }, []);

  const saveCartItemNote = useCallback((productId: string, variantId: string | undefined, note: string) => {
    const cartKey = variantId ? `${productId}-${variantId}` : productId;
    setCart(prev => prev.map(item =>
      (item.variant ? `${item.product.id}-${item.variant.id}` : item.product.id) === cartKey
        ? { ...item, notes: note || undefined }
        : item
    ));
  }, []);

  const saveExistingItemNote = useCallback(async (itemId: string, note: string) => {
    setExistingOrderItems((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, notes: note || undefined } : i)) as typeof prev
    );
    supabase.from('order_items').update({ notes: note || null } as any).eq('id', itemId).then();
  }, []);

  const updateExistingItemQuantity = async (orderItemId: string, newQuantity: number) => {
    if (newQuantity <= 0) {
      promptCancelExistingItem(orderItemId);
      return;
    }

    const item = existingOrderItems.find(i => i.id === orderItemId);
    if (!item) return;

    const previousQuantity = item.quantity;
    const newTotal = item.unit_price * newQuantity;

    const newItems = existingOrderItems.map(i => i.id === orderItemId
      ? { ...i, quantity: newQuantity, total_amount: newTotal }
      : i
    );

    setExistingOrderItems(newItems);

    if (isTempLineId(orderItemId)) {
      if (currentOrder) {
        const subtotal = newItems.reduce((s, i) => s + i.total_amount, 0);
        const total = subtotal - (currentOrder.discount_amount || 0);
        setCurrentOrder({ ...currentOrder, subtotal, tax_amount: 0, total_amount: total });
      }
      return;
    }

    if (currentOrder) {
      recalculateAndSaveTotal(newItems, currentOrder);
    }

    const existingTimer = saveItemQuantityTimersRef.current.get(orderItemId);
    if (existingTimer) clearTimeout(existingTimer);
    const timer = setTimeout(() => {
      saveItemQuantityTimersRef.current.delete(orderItemId);
      supabase.from('order_items').update({ quantity: newQuantity, total_amount: newTotal }).eq('id', orderItemId)
        .then(({ error }) => {
          if (error) {
            setExistingOrderItems(prev =>
              prev.map(i => i.id === orderItemId
                ? { ...i, quantity: previousQuantity, total_amount: item.unit_price * previousQuantity }
                : i
              )
            );
          }
        });
    }, 400);
    saveItemQuantityTimersRef.current.set(orderItemId, timer);
  };

  const deleteExistingItem = async (orderItemId: string, reason?: string) => {
    const deletedItem = existingOrderItems.find(i => i.id === orderItemId);
    if (!deletedItem || !tenant || !user) return;

    if (isTempLineId(orderItemId)) {
      const newItems = existingOrderItems.filter(i => i.id !== orderItemId);
      setExistingOrderItems(newItems);
      if (currentOrder) {
        const subtotal = newItems.reduce((s, i) => s + i.total_amount, 0);
        const total = subtotal - (currentOrder.discount_amount || 0);
        setCurrentOrder({ ...currentOrder, subtotal, tax_amount: 0, total_amount: total });
      }
      if (newItems.length === 0 && currentOrder && isTempOrderId(currentOrder.id)) {
        setCurrentOrder(null);
      }
      return;
    }

    const newItems = existingOrderItems.filter(i => i.id !== orderItemId);
    setExistingOrderItems(newItems);

    if (currentOrder) {
      const newSubtotal = newItems.reduce((sum, i) => sum + i.total_amount, 0);

      setCurrentOrder({
        ...currentOrder,
        subtotal: newSubtotal,
        tax_amount: 0,
        total_amount: newSubtotal - (currentOrder.discount_amount || 0)
      });

      recalculateAndSaveTotal(newItems, currentOrder);
    }

    const { error } = await supabase.from('order_items').delete().eq('id', orderItemId);
    if (error) {
      setExistingOrderItems(prev => [...prev, deletedItem]);
      alert('Ürün silinirken hata oluştu');
      return;
    }

    await supabase.from('order_cancel_logs').insert({
      tenant_id: tenant.id,
      branch_id: (table as any).branch_id || null,
      order_id: currentOrder?.id || null,
      order_item_id: orderItemId,
      order_number: currentOrder?.order_number || null,
      product_name: (deletedItem as any).products?.name || 'Bilinmeyen',
      quantity: deletedItem.quantity,
      unit_price: deletedItem.unit_price,
      cancel_reason: reason || null,
      cancelled_by: user.id,
      cancelled_by_name: profile?.full_name || profile?.email || user.email || '',
    });

    if (newItems.length === 0 && currentOrder && table.table_number !== 0) {
      await supabase.from('restaurant_tables').update({
        status: 'available',
        current_order_id: null,
        session_start: null,
        payment_locked: false,
      }).eq('id', table.id);
      emitTableStateChanged({
        id: table.id,
        status: 'available' as any,
        current_order_id: null,
        session_start: null,
        payment_locked: false,
        order: null,
      });
      await supabase.from('orders').update({ status: 'cancelled' }).eq('id', currentOrder.id);
      onClose();
    }
  };

  const promptCancelExistingItem = (orderItemId: string) => {
    const item = existingOrderItems.find(i => i.id === orderItemId);
    if (!item) return;
    if (requireCancelReason) {
      setCancelReasonModal({
        type: 'existing',
        id: orderItemId,
        productName: (item as any).products?.name || 'Ürün',
        quantity: item.quantity,
        unitPrice: item.unit_price,
      });
      setCancelReason('');
    } else {
      deleteExistingItem(orderItemId);
    }
  };

  const promptCancelCartItem = (productId: string, variantId?: string) => {
    const item = cart.find(i => {
      const key = i.variant ? `${i.product.id}-${i.variant.id}` : i.product.id;
      const target = variantId ? `${productId}-${variantId}` : productId;
      return key === target;
    });
    if (!item) return;
    if (requireCancelReason) {
      setCancelReasonModal({
        type: 'item',
        id: productId,
        variantId,
        productName: item.product.name,
        quantity: item.quantity,
        unitPrice: item.product.price + (item.variant?.price_modifier || 0),
      });
      setCancelReason('');
    } else {
      deleteFromCart(productId, variantId);
    }
  };

  const recalculateAndSaveTotal = (items: typeof existingOrderItems, order: Order) => {
    const subtotal = items.reduce((sum, i) => sum + i.total_amount, 0);
    const total = subtotal - (order.discount_amount || 0);

    setCurrentOrder({ ...order, subtotal, tax_amount: 0, total_amount: total });

    if (isTempOrderId(order.id)) return;

    if (saveOrderTotalTimerRef.current) clearTimeout(saveOrderTotalTimerRef.current);
    saveOrderTotalTimerRef.current = setTimeout(() => {
      supabase.from('orders').update({ subtotal, tax_amount: 0, total_amount: total }).eq('id', order.id).then();
    }, 400);
  };

  const cartSubtotal = useMemo(() =>
    cart.reduce((sum, item) => {
      if (item.weightedPrice !== undefined) {
        return sum + item.weightedPrice;
      }
      const basePrice = item.product.price;
      const variantPrice = item.variant ? item.variant.price_modifier : 0;
      const finalPrice = basePrice + variantPrice;
      return sum + (finalPrice * item.quantity);
    }, 0),
    [cart]
  );

  const calculateTotal = useCallback(() => {
    const subtotal = cartSubtotal + (currentOrder?.subtotal || 0);
    const taxAmount = 0;
    const discountAmount = subtotal * (discount / 100);
    const total = subtotal - discountAmount;
    return { subtotal, taxAmount, discountAmount, total };
  }, [cartSubtotal, currentOrder?.subtotal, discount]);

  const handleSubmitOrder = async (opts?: { closeWithoutUi?: boolean }) => {
    if (cart.length === 0 || !tenant || !user || submittingRef.current) return;
    const closeWithoutUi = !!opts?.closeWithoutUi;
    submittingRef.current = true;
    if (!closeWithoutUi) setSubmitBusy(true);

    const cartSnapshot = [...cart];
    const snapExisting = useOrderSessionStore.getState().existingOrderItems;
    const snapOrder = useOrderSessionStore.getState().currentOrder;

    const hadRealOrder = !!snapOrder?.id && !isTempOrderId(snapOrder.id);

    if (!closeWithoutUi) {
      const orderIdForOptimistic = hadRealOrder
        ? snapOrder!.id
        : `${TEMP_ORDER_PREFIX}-${crypto.randomUUID()}`;

      const optimisticLines = cartSnapshot.map((item) =>
        buildOptimisticOrderItem(
          item,
          tenant.id,
          orderIdForOptimistic,
          `${TEMP_LINE_PREFIX}${crypto.randomUUID()}`
        )
      );

      startTransition(() => {
        setCart([]);
        if (hadRealOrder && snapOrder) {
          const merged = [...snapExisting, ...optimisticLines];
          setExistingOrderItems(merged);
          const subtotal = merged.reduce((s, i) => s + Number(i.total_amount || 0), 0);
          setCurrentOrder({
            ...snapOrder,
            subtotal,
            tax_amount: 0,
            total_amount: subtotal - (snapOrder.discount_amount || 0),
          });
        } else {
          const subtotalGuess = optimisticLines.reduce((s, i) => s + i.total_amount, 0);
          const waiterName = profile?.full_name || profile?.email || user.email || '';
          setCurrentOrder(
            buildPlaceholderOrder({
              id: orderIdForOptimistic,
              tenantId: tenant.id,
              branchId: (table as any).branch_id || null,
              table: { id: table.id, table_number: Number(table.table_number) || 0 },
              userId: user.id,
              waiterName,
              subtotal: subtotalGuess,
            })
          );
          setExistingOrderItems(optimisticLines);
        }
      });
    }

    const runPrints = (activeOrder: Order) => {
      const printSettings = loadPrintSettings();
      const isTakeaway = table.table_number === 0;
      const tableLabel = isTakeaway ? 'Paket' : `Masa ${table.table_number}`;
      const orderNum = activeOrder.order_number;
      const restaurantName = printSettings.restaurantName || tenant.name || 'ŞefPOS';

      queueMicrotask(() => {
        if (printSettings.autoPrintKitchen) {
          const kitchenItems = cartSnapshot.map((item) => ({
            productName: item.product.name,
            variantName: item.variant?.name || null,
            quantity: item.quantity,
            notes: (item as any).notes || null,
            categoryId: item.product.category_id || null,
            productPrinterName: (item.product as any).printer_name || null,
          }));
          printKitchenReceipts({
            settings: printSettings,
            restaurantName,
            tableLabel,
            orderNumber: orderNum,
            items: kitchenItems,
            categories,
          });
        }

        if (isTakeaway && (printSettings as any).autoPrintTakeaway !== false) {
          const receiptItems = cartSnapshot.map((item) => {
            const unitPrice = item.product.price + (item.variant?.price_modifier || 0);
            return {
              productName: item.product.name,
              variantName: item.variant?.name || null,
              quantity: item.quantity,
              unitPrice,
              totalAmount: item.weightedPrice ?? unitPrice * item.quantity,
              notes: (item as any).notes || null,
            };
          });
          const existingTotal = snapExisting.reduce((s, i) => s + Number((i as any).total_amount || 0), 0);
          const newTotal = receiptItems.reduce((s, i) => s + i.totalAmount, 0);
          printTakeawayReceipt({
            settings: printSettings,
            orderType: (activeOrder as any).order_type === 'delivery' ? 'delivery' : 'takeaway',
            orderNumber: orderNum || '',
            customerName: (activeOrder as any).customer_name || undefined,
            customerPhone: (activeOrder as any).customer_phone || undefined,
            deliveryAddress: (activeOrder as any).delivery_address || undefined,
            deliveryNote: (activeOrder as any).delivery_note || undefined,
            courierName: (activeOrder as any).courier_name || undefined,
            estimatedMinutes: (activeOrder as any).estimated_delivery_minutes || undefined,
            items: receiptItems,
            subtotal: newTotal,
            total: existingTotal + newTotal,
          });
        }
      });
    };

    let createdOrder: Order | null = null;

    try {
      let orderId = hadRealOrder ? snapOrder!.id : undefined;

      if (!orderId) {
        const subtotalIns = cartSnapshot.reduce((sum, item) => {
          if (item.weightedPrice !== undefined) return sum + item.weightedPrice;
          const fp = item.product.price + (item.variant ? item.variant.price_modifier : 0);
          return sum + fp * item.quantity;
        }, 0);
        const taxAmount = 0;
        const orderNumber =
          table.table_number === 0
            ? `PAKET-${Date.now().toString().slice(-6)}`
            : `M${table.table_number}-${Date.now().toString().slice(-6)}`;
        const waiterName = profile?.full_name || profile?.email || user.email || '';

        const orderData = await runWithRetry(async () => {
          const r = await supabase
            .from('orders')
            .insert({
              tenant_id: tenant.id,
              branch_id: (table as any).branch_id || null,
              order_number: orderNumber,
              table_id: table.table_number === 0 ? null : table.id,
              order_type: table.table_number === 0 ? 'takeaway' : 'dine_in',
              status: 'open',
              subtotal: subtotalIns,
              tax_amount: taxAmount,
              discount_amount: 0,
              total_amount: subtotalIns + taxAmount,
              payment_status: 'unpaid',
              waiter_id: user.id,
              waiter_name: waiterName,
              created_by: user.id,
            } as any)
            .select()
            .single();
          if (r.error) throw r.error;
          return r.data as Order;
        });

        if (!orderData) throw new Error('Sipariş oluşturulamadı');
        createdOrder = orderData;
        orderId = orderData.id;

        if (table.table_number !== 0) {
          const occupiedAt = new Date().toISOString();
          supabase
            .from('restaurant_tables')
            .update({
              status: 'occupied',
              current_order_id: orderData.id,
              session_start: occupiedAt,
            })
            .eq('id', table.id)
            .then(({ error }) => {
              if (error) console.error('Masa güncelleme hatası:', error);
            });
          emitTableStateChanged({
            id: table.id,
            status: 'occupied' as any,
            current_order_id: orderData.id,
            session_start: occupiedAt,
            payment_locked: false,
            order: {
              id: orderData.id,
              total_amount: subtotalIns,
              order_number: orderData.order_number,
              payment_status: 'unpaid',
            },
          });
        }
      }

      const newItemsPayload = cartSnapshot.map((item) => {
        const finalPrice =
          item.weightedPrice !== undefined && item.quantity > 0
            ? item.weightedPrice / item.quantity
            : item.product.price + (item.variant ? item.variant.price_modifier : 0);
        const lineTotal =
          item.weightedPrice !== undefined ? item.weightedPrice : finalPrice * item.quantity;
        const weightLabel = item.weight ? formatWeightLabel(item.weight) : null;
        return {
          tenant_id: tenant.id,
          order_id: orderId!,
          product_id: item.product.id,
          variant_id: item.variant?.id || null,
          variant_name: item.variant?.name || (weightLabel ? `Gramaj: ${weightLabel}` : null),
          quantity: item.quantity,
          unit_price: finalPrice,
          subtotal: lineTotal,
          tax_rate: item.product.tax_rate,
          discount_amount: 0,
          total_amount: lineTotal,
          notes: item.notes,
        };
      });

      const insertedItems = await runWithRetry(async () => {
        const r = await supabase
          .from('order_items')
          .insert(newItemsPayload)
          .select(ORDER_ITEMS_PANEL_SELECT);
        if (r.error) throw r.error;
        return r.data as any[] | null;
      });

      if (insertedItems?.length) {
        const newItemsOnly = insertedItems;
        const orderForTotals = createdOrder ?? snapOrder!;
        if (closeWithoutUi) {
          const merged = [
            ...snapExisting.filter((i) => !isTempLineId(i.id)),
            ...newItemsOnly,
          ];
          const subtotal = merged.reduce((s, i) => s + Number(i.total_amount || 0), 0);
          const total = subtotal - (orderForTotals.discount_amount || 0);
          await supabase
            .from('orders')
            .update({
              subtotal,
              tax_amount: 0,
              total_amount: total,
            })
            .eq('id', orderForTotals.id);
          runPrints(createdOrder ?? snapOrder!);
          warmOrderItemsForPanel(orderForTotals.id);
        } else {
          startTransition(() => {
            if (createdOrder) {
              setCurrentOrder(createdOrder);
            }
            setExistingOrderItems((prev) => {
              const withoutTemp = prev.filter((i) => !isTempLineId(i.id));
              return [...withoutTemp, ...newItemsOnly];
            });
            const merged = [
              ...snapExisting.filter((i) => !isTempLineId(i.id)),
              ...newItemsOnly,
            ];
            recalculateAndSaveTotal(merged, orderForTotals);
          });
          runPrints(createdOrder ?? snapOrder!);
        }
      }
    } catch (error: any) {
      if (!closeWithoutUi) {
        startTransition(() => {
          setCart(cartSnapshot);
          setExistingOrderItems(snapExisting);
          setCurrentOrder(snapOrder);
        });
      }
      alert('Sipariş eklenirken hata oluştu: ' + error.message);
    } finally {
      submittingRef.current = false;
      if (!closeWithoutUi) setSubmitBusy(false);
    }
  };

  const handleAddPayment = async (method: PaymentMethod, amount: number, printReceiptOnComplete = false) => {
    if (!currentOrder || !tenant || !user) return;
    if (isTempOrderId(currentOrder.id)) {
      alert('Sipariş sunucuya yazılıyor; birkaç saniye sonra tekrar deneyin.');
      return;
    }

    const tempId = crypto.randomUUID();
    const newPayment: PaymentTransaction = {
      id: tempId,
      tenant_id: tenant.id,
      order_id: currentOrder.id,
      payment_method: method,
      amount,
      created_by: user.id,
      created_at: new Date().toISOString()
    };

    setPaymentTransactions(prev => [newPayment, ...prev]);

    try {
      const { data: insertedPayment, error } = await supabase
        .from('payment_transactions')
        .insert({
          tenant_id: tenant.id,
          order_id: currentOrder.id,
          payment_method: method,
          amount,
          created_by: user.id
        })
        .select()
        .single();

      if (error) throw error;

      if (insertedPayment) {
        setPaymentTransactions(prev =>
          prev.map(p => p.id === tempId ? insertedPayment : p)
        );
      }

      await checkAndCompleteOrder(printReceiptOnComplete, [...paymentTransactions.filter(p => p.id !== tempId), insertedPayment || newPayment]);
    } catch (error: any) {
      setPaymentTransactions(prev => prev.filter(p => p.id !== tempId));
      await unlockTable();
      alert('Ödeme eklenirken hata oluştu: ' + error.message);
    }
  };

  const checkAndCompleteOrder = async (shouldPrintReceipt = false, allPayments?: PaymentTransaction[]) => {
    if (!currentOrder) return;
    if (isTempOrderId(currentOrder.id)) return;

    try {
      const payments = allPayments ?? paymentTransactions;
      const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount), 0);
      const { discountAmount, total } = calculateTotal();

      if (totalPaid >= total) {
        await Promise.all([
        supabase.from('orders').update({
          status: 'completed',
          payment_status: 'paid',
          paid_at: new Date().toISOString(),
          discount_amount: discountAmount,
          total_amount: total
        }).eq('id', currentOrder.id),
        payments.length > 0 && tenant && user
          ? supabase.from('cash_register_transactions').insert(
              payments.map((p: any) => ({
                tenant_id: tenant.id,
                branch_id: (table as any).branch_id || null,
                transaction_type: 'order_payment',
                payment_method: p.payment_method,
                amount: Number(p.amount),
                description: `Sipariş #${currentOrder.order_number} - ${table.table_number === 0 ? 'Paket Servis' : `Masa ${table.table_number}`}`,
                reference_id: currentOrder.id,
                reference_type: 'order',
                order_number: currentOrder.order_number,
                table_name: table.table_number === 0 ? 'Paket Servis' : `Masa ${table.table_number}`,
                created_by: user!.id,
              }))
            )
          : Promise.resolve(),
        table.table_number !== 0
          ? supabase.from('restaurant_tables').update({
              status: 'available',
              current_order_id: null,
              session_start: null,
              payment_locked: false,
            }).eq('id', table.id)
          : Promise.resolve(),
      ]);

      if (table.table_number !== 0 && table.id) {
        emitTableStateChanged({
          id: table.id,
          status: 'available' as any,
          current_order_id: null,
          session_start: null,
          payment_locked: false,
          order: null,
        });
      }

      // Stok düşümü çok satırda onlarca sıralı DB çağrısı yapıyor; ödeme modalını bekletmemek için arka planda çalışır.
      const stockOrderId = currentOrder.id;
      const stockItemsSnapshot = existingOrderItems;
      void applyOrderStockMovements(stockOrderId, stockItemsSnapshot).catch((e) => {
        console.warn('Stok hareketi tamamlanamadı:', e);
      });

      const huginPayments = payments
        .filter((p: any) => p.payment_method === 'cash' || p.payment_method === 'credit_card')
        .map((p: any) => ({ method: p.payment_method as 'cash' | 'credit_card', amount: p.amount }));

      const orderItemsSnapshot = existingOrderItems;
      if (huginPayments.length > 0 || shouldPrintReceipt) {
        setTimeout(() => {
          if (huginPayments.length > 0) {
            const tableLabel = table.table_number === 0 ? 'Paket' : `Masa ${table.table_number}`;
            sendSaleToHugin({
              orderNumber: currentOrder.order_number,
              tableLabel,
              items: orderItemsSnapshot.map(item => ({
                productName: (item as any).products?.name || 'Urun',
                quantity: item.quantity,
                unitPrice: item.unit_price,
                totalPrice: item.total_amount,
                categoryVatRate: (item as any).products?.categories?.vat_rate ?? null,
                categoryDepartmentId: (item as any).products?.categories?.hugin_department_id ?? null,
              })),
              totalAmount: total,
              discountAmount,
              payments: huginPayments,
            }).then(result => {
              if (!result.success) {
                console.warn('Hugin yazarkasa hatasi:', result.error);
              }
            });
          }

          if (shouldPrintReceipt) {
            const printSettings = loadPrintSettings();
            const tableLabel = table.table_number === 0 ? 'Paket' : `Masa ${table.table_number}`;
            const payMethod = payments.length === 1 ? (payments[0] as any).payment_method : 'mixed';
            const html = buildReceiptHtml({
              restaurantName: printSettings.restaurantName || tenant?.name || 'ŞefPOS',
              restaurantPhone: printSettings.restaurantPhone,
              restaurantAddress: printSettings.restaurantAddress,
              tableLabel,
              orderNumber: currentOrder.order_number,
              items: orderItemsSnapshot.map(item => ({
                productName: (item as any).products?.name || '',
                variantName: (item as any).variant_name || null,
                quantity: item.quantity,
                unitPrice: item.unit_price,
                totalAmount: item.total_amount,
                notes: (item as any).notes || null,
              })),
              subtotal: currentOrder.subtotal,
              taxAmount: currentOrder.tax_amount,
              discountAmount,
              total,
              paymentMethod: payMethod,
              footer: printSettings.receiptFooter,
              waiterName: (currentOrder as any).waiter_name || undefined,
            });
            printHtml(html, printSettings.defaultReceiptPrinter);
          }
        }, 50);
      }

      queueMicrotask(() => onClose());
      } else {
        supabase.from('orders').update({
          discount_amount: discountAmount,
          total_amount: total,
          payment_status: totalPaid > 0 ? 'partial' : 'unpaid',
        }).eq('id', currentOrder.id).then();
      }
    } catch (error: any) {
      await unlockTable();
      console.error('Order completion error:', error);
      alert('Sipariş güncellenirken hata: ' + error.message);
    }
  };

  const categoryMap = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories]);

  const cartByProductId = useMemo(() => {
    const map = new Map<string, number>();
    cart.forEach(item => {
      map.set(item.product.id, (map.get(item.product.id) || 0) + item.quantity);
    });
    return map;
  }, [cart]);

  const orderByProductId = useMemo(() => {
    const map = new Map<string, number>();
    existingOrderItems.forEach(item => {
      map.set(item.product_id, (map.get(item.product_id) || 0) + item.quantity);
    });
    return map;
  }, [existingOrderItems]);

  const filteredTransferTables = useMemo(() => {
    if (!transferFilterGroupId) return availableTables;
    return availableTables.filter((t) => (t as any).group_id === transferFilterGroupId);
  }, [availableTables, transferFilterGroupId]);

  const filteredMergeTables = useMemo(() => {
    if (!mergeFilterGroupId) return mergeCandidates;
    return mergeCandidates.filter((t) => (t as any).group_id === mergeFilterGroupId);
  }, [mergeCandidates, mergeFilterGroupId]);

  const searchLower = useMemo(() => searchQuery.toLowerCase(), [searchQuery]);
  const filteredProducts = useMemo(() => products.filter(p => {
    const matchCategory = searchQuery ? true : (selectedCategory ? p.category_id === selectedCategory : true);
    const matchSearch = searchQuery
      ? p.name.toLowerCase().includes(searchLower)
      : true;
    return matchCategory && matchSearch;
  }), [products, selectedCategory, searchQuery, searchLower]);

  const { discountAmount, total } = useMemo(() => calculateTotal(), [calculateTotal]);
  const totalPaid = useMemo(() => paymentTransactions.reduce((sum, p) => sum + Number(p.amount), 0), [paymentTransactions]);
  const remainingAmount = useMemo(() => Math.max(0, total - totalPaid), [total, totalPaid]);
  const hasOrderContext = !!(table.current_order_id || currentOrder?.id || orderHydrating);
  const formatWeightLabel = useCallback((grams?: number) => {
    if (!grams || grams <= 0) return null;
    return grams >= 1000 ? `${(grams / 1000).toFixed(3)} kg` : `${Math.round(grams)} g`;
  }, []);
  const getPersistedWeightLabel = useCallback((item: { weight?: number; variant_name?: string | null }) => {
    if (item.weight && item.weight > 0) return formatWeightLabel(item.weight);
    const variantName = typeof item.variant_name === 'string' ? item.variant_name : '';
    if (variantName.startsWith('Gramaj: ')) {
      return variantName.replace(/^Gramaj:\s*/i, '').trim();
    }
    return null;
  }, [formatWeightLabel]);
  const isWeightVariantLabel = useCallback((variantName?: string | null) => {
    return typeof variantName === 'string' && variantName.startsWith('Gramaj: ');
  }, []);

  const payButtonBlocked =
    orderHydrating && existingOrderItems.length === 0 && cart.length === 0;

  const orderLinesSkeleton = (
    <div className="space-y-2 px-3 py-2 min-h-[7.5rem]" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-14 rounded-xl bg-slate-200/70" />
      ))}
    </div>
  );

  return (
    <>
      {scaleWeighingProduct && (
        <ScaleWeighingModal
          product={{
            id: scaleWeighingProduct.id,
            name: scaleWeighingProduct.name,
            price: scaleWeighingProduct.price,
            unit: (scaleWeighingProduct as any).unit
          }}
          scalePort={scalePort}
          scaleBaudRate={scaleBaudRate}
          onConfirm={(weight, totalPrice) => {
            const product = scaleWeighingProduct;
            const weightKg = weight / 1000;
            const weightedProduct: Product = {
              ...product,
              price: product.price,
              name: `${product.name} (${weightKg.toFixed(3)} kg)`
            };
            setCart(prev => [...prev, {
              product: weightedProduct,
              quantity: 1,
              weight: weight,
              weightedPrice: totalPrice
            }]);
            setScaleWeighingProduct(null);
          }}
          onCancel={() => setScaleWeighingProduct(null)}
        />
      )}

      {scaleBarcodeModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[80] p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-green-100 rounded-2xl flex items-center justify-center">
                <Scale className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-800">Terazi Ürünü</h3>
                <p className="text-xs text-gray-500">Tartımlı ürün algılandı</p>
              </div>
            </div>

            <div className="bg-slate-50 rounded-xl p-4 mb-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500 font-medium">Ürün</span>
                <span className="font-bold text-gray-800">{scaleBarcodeModal.product.name}</span>
              </div>
              {scaleBarcodeModal.parsed.type === 'weight' && scaleBarcodeModal.parsed.weightGrams != null && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 font-medium">Ağırlık</span>
                  <span className="font-bold text-gray-800">
                    {scaleBarcodeModal.parsed.weightGrams >= 1000
                      ? `${(scaleBarcodeModal.parsed.weightGrams / 1000).toFixed(3)} kg`
                      : `${scaleBarcodeModal.parsed.weightGrams} g`}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-gray-500 font-medium">Birim Fiyat</span>
                <span className="text-gray-600">{scaleBarcodeModal.product.price.toFixed(2)} ₺/kg</span>
              </div>
              <div className="flex justify-between text-sm border-t border-slate-200 pt-2 mt-2">
                <span className="text-gray-700 font-bold">Toplam Tutar</span>
                <span className="font-black text-green-600 text-lg">{scaleBarcodeModal.calculatedPrice.toFixed(2)} ₺</span>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setScaleBarcodeModal(null)}
                className="flex-1 py-3 rounded-xl border-2 border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50 transition-all active:scale-95"
              >
                İptal
              </button>
              <button
                onClick={handleScaleBarcodeConfirm}
                className="flex-1 py-3 rounded-xl bg-green-600 hover:bg-green-700 text-white font-bold text-sm transition-all active:scale-95"
              >
                Sepete Ekle
              </button>
            </div>
          </div>
        </div>
      )}

      {noteModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[70] p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
            <h3 className="text-lg font-bold text-slate-800 mb-3 flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-blue-500" />
              Ürün Notu
            </h3>
            <textarea
              className="w-full border-2 border-slate-200 rounded-xl p-3 text-sm resize-none focus:outline-none focus:border-blue-400 transition-colors"
              rows={3}
              placeholder="Örnek: Az tuzlu, iyi pişmiş..."
              value={noteInput}
              onChange={e => setNoteInput(e.target.value)}
              autoFocus
            />
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setNoteModal(null)}
                className="flex-1 py-2.5 rounded-xl border-2 border-slate-200 text-slate-600 font-semibold text-sm hover:bg-slate-50 transition-all"
              >
                İptal
              </button>
              <button
                onClick={() => {
                  saveCartItemNote(noteModal.productId, noteModal.variantId, noteInput);
                  setNoteModal(null);
                }}
                className="flex-1 py-2.5 rounded-xl bg-blue-500 text-white font-bold text-sm hover:bg-blue-600 transition-all"
              >
                Kaydet
              </button>
            </div>
          </div>
        </div>
      )}

      {existingItemNoteModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[70] p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
            <h3 className="text-lg font-bold text-slate-800 mb-3 flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-blue-500" />
              Ürün Notu
            </h3>
            <textarea
              className="w-full border-2 border-slate-200 rounded-xl p-3 text-sm resize-none focus:outline-none focus:border-blue-400 transition-colors"
              rows={3}
              placeholder="Örnek: Az tuzlu, iyi pişmiş..."
              value={existingNoteInput}
              onChange={e => setExistingNoteInput(e.target.value)}
              autoFocus
            />
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setExistingItemNoteModal(null)}
                className="flex-1 py-2.5 rounded-xl border-2 border-slate-200 text-slate-600 font-semibold text-sm hover:bg-slate-50 transition-all"
              >
                İptal
              </button>
              <button
                onClick={() => {
                  saveExistingItemNote(existingItemNoteModal.itemId, existingNoteInput);
                  setExistingItemNoteModal(null);
                }}
                className="flex-1 py-2.5 rounded-xl bg-blue-500 text-white font-bold text-sm hover:bg-blue-600 transition-all"
              >
                Kaydet
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedProductForVariant && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-slate-800 mb-4">
              {selectedProductForVariant.name} - Seçenek Seçin
            </h3>
            <div className="space-y-2 max-h-[60vh] overflow-y-auto">
              {productVariants
                .filter(v => v.product_id === selectedProductForVariant.id)
                .map(variant => {
                  const basePrice = selectedProductForVariant.price;
                  const finalPrice = basePrice + variant.price_modifier;
                  return (
                    <button
                      key={variant.id}
                      onClick={() => {
                        addToCart(selectedProductForVariant, variant);
                        setSelectedProductForVariant(null);
                      }}
                      className="w-full bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 text-white p-4 rounded-xl font-bold text-lg transition-all active:scale-95 flex justify-between items-center"
                    >
                      <span>{variant.name}</span>
                      <span>{finalPrice.toFixed(0)} ₺</span>
                    </button>
                  );
                })}
            </div>
            <button
              onClick={() => setSelectedProductForVariant(null)}
              className="w-full mt-4 bg-slate-200 text-slate-700 py-3 rounded-xl font-bold hover:bg-slate-300 transition-all active:scale-95"
            >
              İptal
            </button>
          </div>
        </div>
      )}

      {paymentLockedWarning && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[200]">
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full mx-4 text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-8 h-8 text-red-600" />
            </div>
            <h2 className="text-xl font-bold text-slate-800 mb-2">Masa Kilitli</h2>
            <p className="text-slate-600 mb-6">
              Bu masa şu anda başka bir kasada ödeme alınıyor. Lütfen bekleyin.
            </p>
            <button
              onClick={() => setPaymentLockedWarning(false)}
              className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-xl transition-all active:scale-95"
            >
              Tamam
            </button>
          </div>
        </div>
      )}

      {showPayment && (
        <PaymentModal
          remainingAmount={remainingAmount}
          discount={discount}
          onDiscountChange={setDiscount}
          onPayment={handleAddPayment}
          onClose={() => {
            setShowPayment(false);
            unlockTable();
          }}
          loading={false}
        />
      )}

      {showTableTransfer && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[70] p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center">
                  <ArrowRightLeft className="w-5 h-5 text-orange-600" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900">Masa Taşı</h3>
                  <p className="text-sm text-gray-500">Masa {table.table_number} siparişini taşı</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowTableTransfer(false);
                  setTransferFilterGroupId(null);
                }}
                className="p-2 hover:bg-gray-100 rounded-lg transition"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto flex-1">
              <TableGroupPickerChips
                groups={transferGroups}
                selectedId={transferFilterGroupId}
                onSelect={setTransferFilterGroupId}
                accent="orange"
              />
              {availableTables.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <p className="font-medium">Boş masa bulunamadı</p>
                  <p className="text-sm mt-1">Taşımak için en az bir boş masa gerekli</p>
                </div>
              ) : filteredTransferTables.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <p className="font-medium">Bu grupta boş masa yok</p>
                  <p className="text-sm mt-1">Başka bir grup seçin veya Tümü</p>
                </div>
              ) : (
                <>
                  <p className="text-sm text-gray-600 mb-4">Taşımak için boş masaya dokunun:</p>
                  <div className="grid grid-cols-4 gap-2">
                    {filteredTransferTables.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => handleTableTransfer(t)}
                        disabled={transferring}
                        className="aspect-square bg-orange-50 hover:bg-orange-100 border-2 border-orange-200 hover:border-orange-400 rounded-xl flex items-center justify-center font-black text-orange-700 text-lg transition-all active:scale-95 disabled:opacity-50"
                      >
                        {t.table_number}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            <div className="p-5 border-t border-gray-100">
              <button
                type="button"
                onClick={() => {
                  setShowTableTransfer(false);
                  setTransferFilterGroupId(null);
                }}
                className="w-full py-2.5 border border-gray-300 rounded-xl hover:bg-gray-50 transition text-sm font-medium"
              >
                İptal
              </button>
            </div>
          </div>
        </div>
      )}

      {showTableMerge && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[70] p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-violet-100 rounded-xl flex items-center justify-center">
                  <Combine className="w-5 h-5 text-violet-600" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900">Masa Birleştir</h3>
                  <p className="text-sm text-gray-500">
                    Birleşik siparişin kalacağı dolu masayı seçin (Masa {table.table_number} boşalır)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowTableMerge(false);
                  setMergeFilterGroupId(null);
                }}
                className="p-2 hover:bg-gray-100 rounded-lg transition"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto flex-1">
              <TableGroupPickerChips
                groups={mergeGroups}
                selectedId={mergeFilterGroupId}
                onSelect={setMergeFilterGroupId}
                accent="violet"
              />
              <p className="text-sm text-gray-600 mb-3">
                Hedef dolu masaya dokunun: bu masadaki (Masa {table.table_number}) ürün ve ödemeler o masanın
                siparişine eklenir; Masa {table.table_number} açık kalır, birleşik sipariş seçtiğiniz masada
                görünür.
              </p>
              {mergeCandidates.length === 0 ? null : filteredMergeTables.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <p className="font-medium">Bu grupta birleştirilecek masa yok</p>
                  <p className="text-sm mt-1">Başka bir grup seçin veya Tümü</p>
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-2">
                  {filteredMergeTables.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => handleTableMerge(t)}
                      disabled={merging}
                      className="aspect-square bg-violet-50 hover:bg-violet-100 border-2 border-violet-200 hover:border-violet-400 rounded-xl flex items-center justify-center font-black text-violet-800 text-lg transition-all active:scale-95 disabled:opacity-50"
                    >
                      {t.table_number}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="p-5 border-t border-gray-100">
              <button
                type="button"
                onClick={() => {
                  setShowTableMerge(false);
                  setMergeFilterGroupId(null);
                }}
                className="w-full py-2.5 border border-gray-300 rounded-xl hover:bg-gray-50 transition text-sm font-medium"
              >
                İptal
              </button>
            </div>
          </div>
        </div>
      )}

      {cancelReasonModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[70] p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-800">Ürün İptali</h3>
                <p className="text-xs text-gray-500">{cancelReasonModal.productName} x{cancelReasonModal.quantity}</p>
              </div>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                İptal Açıklaması {requireCancelReason ? <span className="text-red-500">*</span> : <span className="text-gray-400">(opsiyonel)</span>}
              </label>
              <textarea
                value={cancelReason}
                onChange={e => setCancelReason(e.target.value)}
                placeholder="Örn: Müşteri vazgeçti, yanlış ürün..."
                rows={3}
                className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-orange-400 resize-none"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => { setCancelReasonModal(null); setCancelReason(''); }}
                className="flex-1 bg-gray-100 text-gray-700 font-bold py-3 rounded-xl text-sm active:scale-95"
              >
                Vazgeç
              </button>
              <button
                onClick={() => {
                  if (requireCancelReason && !cancelReason.trim()) {
                    alert('Lütfen iptal açıklaması girin');
                    return;
                  }
                  const modal = cancelReasonModal;
                  const reason = cancelReason.trim() || undefined;
                  setCancelReasonModal(null);
                  setCancelReason('');
                  if (modal.type === 'existing') {
                    deleteExistingItem(modal.id, reason);
                  } else {
                    deleteFromCart(modal.id, modal.variantId);
                  }
                }}
                className="flex-1 bg-red-500 text-white font-bold py-3 rounded-xl text-sm active:scale-95"
              >
                İptal Et
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="fixed inset-0 bg-white md:bg-black/75 flex items-center justify-center z-50 overflow-hidden">
        <div className="bg-white w-full h-full md:rounded-2xl md:shadow-2xl md:max-w-[98vw] md:h-[97vh] lg:max-w-7xl lg:h-[95vh] flex flex-col overflow-hidden">
          {/* Mobile Header - Compact */}
          <div className="md:hidden bg-gradient-to-r from-orange-500 to-red-600 px-3 py-3 flex items-center justify-between shrink-0 shadow-md">
            <div className="text-white">
              <h2 className="text-lg font-bold">
                {table.table_number === 0 ? 'PAKET SERVİS' : `Masa ${table.table_number}`}
              </h2>
              <p className="text-xs opacity-90">
                {currentOrder ? `Sipariş #${currentOrder.order_number}` : 'Yeni Sipariş'}
              </p>
            </div>
            <div className="flex items-center gap-1">
              {currentOrder && table.table_number !== 0 && (
                <>
                  <button
                    onClick={openTableTransfer}
                    className="text-white p-2 rounded-lg active:scale-95 bg-white/20"
                    title="Masa Taşı"
                  >
                    <ArrowRightLeft className="w-5 h-5" />
                  </button>
                  <button
                    onClick={openTableMerge}
                    className="text-white p-2 rounded-lg active:scale-95 bg-white/20"
                    title="Masa Birleştir"
                  >
                    <Combine className="w-5 h-5" />
                  </button>
                </>
              )}
              <button
                onClick={() => { unlockTable(); onClose(); }}
                className="text-white p-2 rounded-lg active:scale-95 bg-white/20"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>

          {/* Desktop Header */}
          <div className="hidden md:block bg-gradient-to-r from-orange-500 to-red-600 px-4 lg:px-8 py-3 lg:py-5 shrink-0">
            <div className="flex items-center justify-between">
              <div className="text-white">
                <h2 className="text-xl lg:text-3xl font-bold">
                  {table.table_number === 0 ? 'PAKET SERVİS' : `Masa ${table.table_number}`}
                </h2>
                <p className="text-xs lg:text-sm opacity-90 mt-0.5">
                  {currentOrder ? `Sipariş #${currentOrder.order_number}` : 'Yeni Sipariş'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {currentOrder && table.table_number !== 0 && (
                  <>
                    <button
                      onClick={openTableTransfer}
                      className="text-white hover:bg-white/20 px-3 lg:px-4 py-2 lg:py-2.5 rounded-xl transition-all active:scale-95 flex items-center gap-2 border border-white/30"
                      title="Masa Taşı"
                    >
                      <ArrowRightLeft className="w-4 h-4 lg:w-5 lg:h-5" />
                      <span className="text-sm lg:text-base font-semibold">Masa Taşı</span>
                    </button>
                    <button
                      onClick={openTableMerge}
                      className="text-white hover:bg-white/20 px-3 lg:px-4 py-2 lg:py-2.5 rounded-xl transition-all active:scale-95 flex items-center gap-2 border border-white/30"
                      title="Masa Birleştir"
                    >
                      <Combine className="w-4 h-4 lg:w-5 lg:h-5" />
                      <span className="text-sm lg:text-base font-semibold">Birleştir</span>
                    </button>
                  </>
                )}
                <button
                  onClick={() => { unlockTable(); onClose(); }}
                  className="text-white hover:bg-white/20 p-2 lg:p-3 rounded-xl transition-all active:scale-95"
                >
                  <X className="w-5 h-5 lg:w-7 lg:h-7" />
                </button>
              </div>
            </div>
          </div>

          {/* Mobile Layout - Full Width Products + Bottom Drawer */}
          {isMobileViewport && (
          <div className="flex-1 flex flex-col overflow-hidden bg-white relative">
            {/* Quantity Multipliers + Search + Barcode */}
            <div className="bg-gradient-to-r from-orange-500 to-red-600 shrink-0 px-2 pt-2 pb-1.5 space-y-1.5">
              <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(num => (
                  <button
                    key={num}
                    onClick={() => setQuantityMultiplier(num)}
                    className={`px-4 py-2.5 rounded-lg font-black text-sm whitespace-nowrap transition-all min-w-[44px] min-h-[44px] flex items-center justify-center ${
                      quantityMultiplier === num
                        ? 'bg-white text-orange-600 shadow-lg scale-110'
                        : 'bg-orange-400/50 text-white active:bg-orange-300/70'
                    }`}
                  >
                    {num}x
                  </button>
                ))}
              </div>
              <div className="flex gap-1.5">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-orange-300" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Ürün ara..."
                    className="w-full bg-white/20 text-white placeholder-orange-200 rounded-lg pl-9 pr-3 py-2 text-sm font-medium outline-none border border-white/30 focus:bg-white/30"
                  />
                  {searchQuery && (
                    <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/70">
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <div className="relative w-28">
                  <Scale className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-orange-300" />
                  <input
                    ref={barcodeInputRef}
                    type="text"
                    value={barcodeInputValue}
                    onChange={e => setBarcodeInputValue(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { handleBarcodeInputSubmit(barcodeInputValue); e.preventDefault(); } }}
                    onBlur={() => { if (barcodeInputValue.length >= 8) handleBarcodeInputSubmit(barcodeInputValue); }}
                    placeholder="Barkod..."
                    className="w-full bg-white/20 text-white placeholder-orange-200 rounded-lg pl-8 pr-2 py-2 text-xs font-mono outline-none border border-white/30 focus:bg-white/30"
                  />
                </div>
              </div>
            </div>

            {/* Categories - Top Tabs (hidden when searching) */}
            {!searchQuery && (
              <div className="bg-white border-b-2 border-gray-200 shrink-0">
                <div
                  className="flex gap-2 px-2 pt-2 pb-2"
                  style={{ overflowX: 'scroll', WebkitOverflowScrolling: 'touch' as any, scrollbarWidth: 'none' }}
                >
                  {categories.map((category) => (
                    <button
                      key={category.id}
                      onClick={() => setSelectedCategory(category.id)}
                      className={`px-5 py-3 rounded-xl font-bold whitespace-nowrap text-base shadow-md min-h-[52px] shrink-0 ${
                        selectedCategory === category.id
                          ? 'text-white'
                          : 'bg-white text-gray-700 border-2 border-gray-300'
                      }`}
                      style={{
                        backgroundColor: selectedCategory === category.id ? category.color : undefined
                      }}
                    >
                      {category.name.toUpperCase()}
                    </button>
                  ))}
                  <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 shrink-0 ml-auto">
                    <button
                      onClick={() => changeGridSize(1)}
                      disabled={productGridSize >= 8}
                      className="w-8 h-8 flex items-center justify-center rounded-md bg-white shadow text-gray-600 active:scale-90 disabled:opacity-30"
                    >
                      <ZoomOut className="w-4 h-4" />
                    </button>
                    <span className="text-sm font-bold text-gray-600 w-5 text-center">{productGridSize}</span>
                    <button
                      onClick={() => changeGridSize(-1)}
                      disabled={productGridSize <= 2}
                      className="w-8 h-8 flex items-center justify-center rounded-md bg-white shadow text-gray-600 active:scale-90 disabled:opacity-30"
                    >
                      <ZoomIn className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Products Grid - Full Width */}
            <div className="flex-1 overflow-y-auto bg-gray-50 p-2 pb-28">
              {filteredProducts.length === 0 && searchQuery && (
                <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                  <Search className="w-10 h-10 mb-2 opacity-30" />
                  <p className="text-sm font-medium">"{searchQuery}" bulunamadı</p>
                </div>
              )}
              <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${productGridSize}, minmax(0, 1fr))` }}>
                {filteredProducts.map((product) => {
                  const category = categoryMap.get(product.category_id || '');
                  const totalQty = (cartByProductId.get(product.id) || 0) + (orderByProductId.get(product.id) || 0);
                  const isSmall = productGridSize >= 5;
                  const isTiny = productGridSize >= 7;

                  return (
                    <button
                      key={product.id}
                      onPointerDown={() => addToCart(product)}
                      className="aspect-square bg-gradient-to-br from-orange-50 to-red-50 rounded-lg flex flex-col relative shadow-md overflow-hidden border-[3px] border-orange-500 select-none transition-transform duration-75 ease-out active:scale-[0.97] active:brightness-95"
                    >
                      {totalQty > 0 && (
                        <div
                          className="absolute top-0.5 right-0.5 bg-gradient-to-br from-orange-500 to-red-600 text-white font-black rounded-full flex items-center justify-center shadow-lg border border-white z-10"
                          style={{ fontSize: isTiny ? 8 : 10, width: isTiny ? 14 : 18, height: isTiny ? 14 : 18 }}
                        >
                          {totalQty}
                        </div>
                      )}
                      {(product as any).scale_enabled && (
                        <div
                          className="absolute top-0.5 left-0.5 bg-emerald-600 text-white rounded-full flex items-center justify-center shadow-md border border-white z-10"
                          title="Terazi ürünü"
                          style={{ width: isTiny ? 14 : 18, height: isTiny ? 14 : 18 }}
                        >
                          <Scale className="text-white" style={{ width: isTiny ? 8 : 10, height: isTiny ? 8 : 10 }} strokeWidth={2.5} />
                        </div>
                      )}
                      <div className="flex-1 flex flex-col items-center justify-center overflow-hidden" style={{ padding: isTiny ? 2 : isSmall ? 3 : 6 }}>
                        <h3
                          className="font-black text-gray-800 leading-tight text-center overflow-hidden"
                          style={{
                            fontSize: isTiny ? 7 : isSmall ? 9 : 11,
                            display: '-webkit-box',
                            WebkitLineClamp: isTiny ? 2 : 3,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                            marginBottom: isTiny ? 1 : 3,
                            width: '100%',
                          }}
                        >
                          {product.name.toUpperCase()}
                        </h3>
                        <p
                          className="font-black text-center leading-none"
                          style={{
                            fontSize: isTiny ? 8 : isSmall ? 10 : 13,
                            color: category?.color || '#F97316',
                          }}
                        >
                          {product.price.toFixed(0)}₺
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Bottom Drawer + Action Bar */}
            <div
              ref={drawerRef}
              className="fixed bottom-0 left-0 right-0 z-50 flex flex-col"
              style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
            >
              {/* Drawer Panel */}
              <div
                className={`bg-white border-t-2 border-orange-300 shadow-2xl transition-[max-height] duration-200 ease-out overflow-hidden ${
                  drawerOpen ? 'max-h-[55vh]' : 'max-h-0'
                }`}
              >
                <div className="overflow-y-auto [overflow-anchor:none]" style={{ maxHeight: '55vh' }}>
                  {cart.length > 0 && (
                    <div className="px-3 pt-3 pb-1">
                      <div className="text-[10px] font-black text-orange-500 uppercase tracking-wider mb-1.5">Bekleyen ({cart.reduce((s,i)=>s+i.quantity,0)} ürün)</div>
                      <div className="space-y-1.5">
                        {cart.map((item) => {
                          const finalPrice = item.product.price + (item.variant ? item.variant.price_modifier : 0);
                          return (
                            <div
                              key={`cart-${item.product.id}-${item.variant?.id || 'none'}`}
                              className="bg-orange-50 border border-orange-200 rounded-xl px-3 py-2"
                            >
                              <div className="flex items-center gap-2">
                                <div className="flex-1 min-w-0">
                                  <div className="font-bold text-gray-800 text-sm leading-tight">{item.product.name}</div>
                                  {item.variant && <div className="text-xs text-orange-600 font-bold">{item.variant.name}</div>}
                                  {item.weight ? (
                                    <div className="text-[10px] text-emerald-700 font-bold mt-0.5">
                                      Gramaj: {formatWeightLabel(item.weight)}
                                    </div>
                                  ) : null}
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <button onPointerDown={() => removeFromCart(item.product.id, item.variant?.id)} className="w-8 h-8 bg-orange-200 rounded-full flex items-center justify-center active:scale-90">
                                    <Minus className="w-4 h-4 text-orange-700" />
                                  </button>
                                  <span className="w-6 text-center font-black text-sm text-orange-700">{item.quantity}</span>
                                  <button onPointerDown={() => addToCart(item.product, item.variant)} className="w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center active:scale-90">
                                    <Plus className="w-4 h-4 text-white" />
                                  </button>
                                </div>
                                <div className="w-16 text-right font-black text-orange-600 text-sm shrink-0">
                                  {(finalPrice * item.quantity).toFixed(0)}₺
                                </div>
                                <button
                                  onClick={() => { setNoteModal({ productId: item.product.id, variantId: item.variant?.id, currentNote: item.notes || '' }); setNoteInput(item.notes || ''); }}
                                  className={`p-1.5 active:scale-90 ${item.notes ? 'text-blue-500' : 'text-gray-300'}`}
                                >
                                  <MessageSquare className="w-4 h-4" />
                                </button>
                                <button onClick={() => promptCancelCartItem(item.product.id, item.variant?.id)} className="text-red-400 active:scale-90 p-1.5">
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                              {item.notes && (
                                <div className="mt-1 text-[10px] text-blue-600 font-medium bg-blue-50 rounded px-2 py-0.5 truncate">Not: {item.notes}</div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {existingOrderItems.length > 0 && (
                    <div className="px-3 pt-2 pb-1">
                      <div className="text-[10px] font-black text-green-600 uppercase tracking-wider mb-1.5">
                        Masada ({existingOrderItems.reduce((s,i)=>s+i.quantity,0)} ürün)
                        {currentOrder?.waiter_name && (
                          <span className="ml-2 text-gray-400 normal-case font-semibold">— {currentOrder.waiter_name}</span>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        {existingOrderItems.map((item) => (
                          <div
                            key={item.id}
                            className="border rounded-xl px-3 py-2 bg-green-50 border-green-200"
                          >
                            <div className="flex items-center gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="font-bold text-gray-800 text-sm leading-tight">{(item as any).products?.name || 'Ürün'}</div>
                                {(item as any).variant_name && <div className="text-xs text-green-600 font-bold">{(item as any).variant_name}</div>}
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <button onPointerDown={() => updateExistingItemQuantity(item.id, item.quantity - 1)} className="w-7 h-7 bg-orange-200 rounded-full flex items-center justify-center active:scale-90">
                                  <Minus className="w-3.5 h-3.5 text-orange-700" />
                                </button>
                                <span className="w-6 text-center font-black text-sm text-gray-700">{item.quantity}</span>
                                <button onPointerDown={() => updateExistingItemQuantity(item.id, item.quantity + 1)} className="w-7 h-7 bg-green-500 rounded-full flex items-center justify-center active:scale-90">
                                  <Plus className="w-3.5 h-3.5 text-white" />
                                </button>
                              </div>
                              <div className="font-black text-sm shrink-0 text-green-700">
                                {(item.unit_price * item.quantity).toFixed(0)}₺
                              </div>
                              <button
                                onClick={() => { setExistingItemNoteModal({ itemId: item.id, currentNote: (item as any).notes || '' }); setExistingNoteInput((item as any).notes || ''); }}
                                className={`p-1.5 active:scale-90 ${(item as any).notes ? 'text-blue-500' : 'text-gray-300'}`}
                              >
                                <MessageSquare className="w-4 h-4" />
                              </button>
                              <button onClick={() => promptCancelExistingItem(item.id)} className="text-red-400 active:scale-90 p-1.5">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                            {(item as any).notes && (
                              <div className="mt-1 text-[10px] text-blue-600 font-medium bg-blue-50 rounded px-2 py-0.5 truncate">Not: {(item as any).notes}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {cart.length === 0 && existingOrderItems.length === 0 && (
                    orderHydrating ? (
                      orderLinesSkeleton
                    ) : (
                      <div className="py-8 text-center text-gray-400 text-sm font-medium">Henüz ürün eklenmedi</div>
                    )
                  )}
                </div>

                {cart.length > 0 && (
                  <div className="px-3 pb-3 pt-1.5 border-t border-orange-100 bg-white">
                    <button
                      onClick={async () => {
                        await handleSubmitOrder();
                        setDrawerOpen(false);
                      }}
                      disabled={submitBusy}
                      className="w-full bg-gradient-to-r from-orange-500 to-red-600 text-white font-black py-3.5 rounded-xl text-base active:scale-95 shadow-lg disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      <Check className="w-5 h-5" />
                      MASAYA GÖNDER ({cart.reduce((s, i) => s + i.quantity, 0)} ürün)
                    </button>
                  </div>
                )}
              </div>

              {/* Bottom Bar */}
              <div className="bg-gradient-to-r from-orange-500 to-red-600 shadow-2xl border-t-2 border-orange-700">
                <button
                  onClick={() => setDrawerOpen(p => !p)}
                  className="w-full flex items-center justify-between px-4 py-2 border-b border-orange-400/50"
                >
                  <div className="flex items-center gap-2">
                    <ShoppingCart className="w-4 h-4 text-white" />
                    <span className="text-white font-black text-sm">
                      {orderHydrating && existingOrderItems.length === 0 && cart.length === 0
                        ? 'Yükleniyor…'
                        : existingOrderItems.length + cart.length > 0
                          ? `${existingOrderItems.reduce((s,i)=>s+i.quantity,0) + cart.reduce((s,i)=>s+i.quantity,0)} ürün`
                          : 'Sipariş yok'}
                    </span>
                    {cart.length > 0 && (
                      <span className="bg-white text-orange-600 text-[10px] font-black px-1.5 py-0.5 rounded-full">
                        +{cart.reduce((s,i)=>s+i.quantity,0)} bekliyor
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-white font-black text-lg">{total.toFixed(0)} ₺</span>
                    {drawerOpen ? <ChevronDown className="w-5 h-5 text-white" /> : <ChevronUp className="w-5 h-5 text-white" />}
                  </div>
                </button>

                <div className="flex gap-2 p-2" style={{ paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom, 0px))' }}>
                  <button
                    type="button"
                    onClick={() => {
                      const hasCart = cart.length > 0;
                      flushSync(() => {
                        onClose();
                      });
                      void unlockTable();
                      if (hasCart) void handleSubmitOrder({ closeWithoutUi: true });
                    }}
                    className="flex-1 bg-white/20 text-white font-black py-4 rounded-xl text-base active:scale-95 shadow-lg border border-white/30"
                  >
                    KAPAT
                  </button>
                  {hasOrderContext && permissions.can_process_payments && (
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (payButtonBlocked || payOpening) return;
                        if (!currentOrder?.id || isTempOrderId(currentOrder.id)) {
                          alert('Sipariş sunucuya yazılıyor; birkaç saniye bekleyin.');
                          return;
                        }
                        setPayOpening(true);
                        try {
                          const canPay = await lockTableForPayment();
                          if (canPay) setShowPayment(true);
                          if (cart.length > 0) handleSubmitOrder();
                        } finally {
                          setPayOpening(false);
                        }
                      }}
                      disabled={payButtonBlocked || submitBusy || payOpening}
                      className="flex-1 bg-green-500 text-white font-black py-4 rounded-xl text-base active:scale-95 shadow-lg border border-green-400 disabled:opacity-50 disabled:pointer-events-none transition-colors duration-75"
                    >
                      {payOpening ? 'AÇILIYOR...' : (remainingAmount > 0 ? `ÖDE ${remainingAmount.toFixed(0)}₺` : 'ÖDE')}
                    </button>
                  )}
                </div>

                {(window as any).electronAPI?.isElectron && (
                  <div className="border-t border-orange-400/30 px-2 py-1.5 flex items-center gap-2 bg-orange-600/30">
                    <Scale className="w-3.5 h-3.5 text-white shrink-0" />
                    <select
                      value={scalePort}
                      onChange={(e) => setScalePort(e.target.value)}
                      className="text-xs px-2 py-1 rounded-lg flex-1 max-w-xs"
                    >
                      {Array.from({ length: 16 }, (_, i) => {
                        const c = `COM${i + 1}`;
                        return (
                          <option key={c} value={c}>{c}</option>
                        );
                      })}
                    </select>
                    <button
                      onClick={() => setScaleListening(!scaleListening)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all text-white ${
                        scaleListening
                          ? 'bg-green-500 hover:bg-green-600'
                          : 'bg-slate-600 hover:bg-slate-700'
                      }`}
                    >
                      {scaleListening ? 'Açık' : 'Kapalı'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
          )}

          {/* Desktop Layout */}
          {!isMobileViewport && (
          <div className="flex flex-1 overflow-hidden">
            <div className="flex-1 flex flex-col overflow-hidden min-h-0">
              <div className="bg-slate-50 border-b shrink-0">
                <div className="flex gap-1.5 p-2 border-b bg-gradient-to-r from-orange-500 to-red-600 overflow-x-auto">
                  <span className="text-white font-bold text-xs py-1.5 px-2 whitespace-nowrap">Miktar:</span>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(num => (
                    <button
                      key={num}
                      onClick={() => setQuantityMultiplier(num)}
                      className={`px-3 py-1.5 rounded-lg font-black text-xs whitespace-nowrap transition-all ${
                        quantityMultiplier === num
                          ? 'bg-white text-orange-600 shadow-lg scale-110'
                          : 'bg-orange-400/50 text-white hover:bg-orange-400/70'
                      }`}
                    >
                      {num}x
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2 px-2 lg:px-3 pt-2 pb-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder="Ürün ara..."
                      className="w-full bg-white border-2 border-gray-200 rounded-lg pl-9 pr-8 py-2 text-sm focus:outline-none focus:border-orange-400"
                    />
                    {searchQuery && (
                      <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <div className="relative w-36 lg:w-44">
                    <Scale className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      ref={barcodeInputRef}
                      type="text"
                      value={barcodeInputValue}
                      onChange={e => setBarcodeInputValue(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { handleBarcodeInputSubmit(barcodeInputValue); e.preventDefault(); } }}
                      onBlur={() => { if (barcodeInputValue.length >= 8) handleBarcodeInputSubmit(barcodeInputValue); }}
                      placeholder="Barkod okut..."
                      className="w-full bg-white border-2 border-gray-200 rounded-lg pl-9 pr-3 py-2 text-sm font-mono focus:outline-none focus:border-green-400"
                    />
                  </div>
                  <div className="flex items-center gap-1 shrink-0 bg-gray-100 rounded-lg p-1">
                    <button
                      onClick={() => changeGridSize(1)}
                      disabled={productGridSize >= 8}
                      className="w-7 h-7 flex items-center justify-center rounded-md bg-white shadow text-gray-600 hover:bg-gray-50 transition-all disabled:opacity-30"
                      title="Küçült"
                    >
                      <ZoomOut className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-xs font-bold text-gray-600 w-4 text-center">{productGridSize}</span>
                    <button
                      onClick={() => changeGridSize(-1)}
                      disabled={productGridSize <= 2}
                      className="w-7 h-7 flex items-center justify-center rounded-md bg-white shadow text-gray-600 hover:bg-gray-50 transition-all disabled:opacity-30"
                      title="Büyüt"
                    >
                      <ZoomIn className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-2 lg:p-4 min-h-0 bg-gray-50">
                <div className="grid gap-2 lg:gap-3" style={{ gridTemplateColumns: `repeat(${productGridSize}, minmax(0, 1fr))` }}>
                  {filteredProducts.map((product) => {
                    const category = categoryMap.get(product.category_id || '');
                    const totalQty = (cartByProductId.get(product.id) || 0) + (orderByProductId.get(product.id) || 0);
                    const isSmall = productGridSize >= 5;
                    const isTiny = productGridSize >= 7;

                    return (
                      <button
                        key={product.id}
                        onPointerDown={() => addToCart(product)}
                        className="aspect-square bg-gradient-to-br from-orange-50 to-red-50 rounded-lg flex flex-col overflow-hidden relative border-[3px] border-orange-500 shadow-md hover:shadow-xl hover:border-orange-600 select-none transition-transform duration-75 ease-out active:scale-[0.97] active:brightness-95"
                      >
                        {totalQty > 0 && (
                          <div
                            className="absolute top-0.5 right-0.5 bg-gradient-to-br from-orange-500 to-red-600 text-white font-black rounded-full flex items-center justify-center shadow-lg border border-white z-10"
                            style={{ fontSize: isTiny ? 9 : isSmall ? 10 : 12, width: isTiny ? 16 : isSmall ? 20 : 26, height: isTiny ? 16 : isSmall ? 20 : 26 }}
                          >
                            {totalQty}
                          </div>
                        )}
                        {(product as any).scale_enabled && (
                          <div
                            className="absolute top-0.5 left-0.5 bg-emerald-600 text-white rounded-full flex items-center justify-center shadow-md border border-white z-10"
                            title="Terazi ürünü"
                            style={{ width: isTiny ? 16 : isSmall ? 20 : 26, height: isTiny ? 16 : isSmall ? 20 : 26 }}
                          >
                            <Scale className="text-white" style={{ width: isTiny ? 9 : isSmall ? 11 : 14, height: isTiny ? 9 : isSmall ? 11 : 14 }} strokeWidth={2.5} />
                          </div>
                        )}
                        <div className="flex-1 flex flex-col items-center justify-center overflow-hidden" style={{ padding: isTiny ? 2 : isSmall ? 4 : 8 }}>
                          <h3
                            className="font-black text-slate-800 leading-tight text-center overflow-hidden"
                            style={{
                              fontSize: isTiny ? 8 : isSmall ? 10 : 13,
                              display: '-webkit-box',
                              WebkitLineClamp: isTiny ? 2 : 3,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden',
                              marginBottom: isTiny ? 1 : isSmall ? 3 : 5,
                              width: '100%',
                            }}
                          >
                            {product.name.toUpperCase()}
                          </h3>
                          <p
                            className="font-black text-center leading-none"
                            style={{
                              fontSize: isTiny ? 9 : isSmall ? 11 : 15,
                              color: category?.color || '#F97316',
                            }}
                          >
                            {product.price.toFixed(0)}₺
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Desktop Category Column - between products and cart */}
            {!searchQuery && (
              <DesktopCategoryColumn
                categories={categories}
                selectedCategory={selectedCategory}
                onSelectCategory={setSelectedCategory}
                onReorder={(reordered) => setCategories(reordered)}
              />
            )}

            <div className="w-64 md:w-72 lg:w-96 xl:w-[420px] bg-slate-50 border-l flex flex-col shrink-0">
              <div className="p-4 bg-white border-b shrink-0">
                <h3 className="text-lg font-bold text-slate-800 flex items-center">
                  <ShoppingCart className="w-5 h-5 mr-2" />
                  Sepet
                </h3>
                {currentOrder?.waiter_name && (
                  <p className="text-xs text-gray-500 mt-1">Garson: <span className="font-semibold text-gray-700">{currentOrder.waiter_name}</span></p>
                )}
              </div>

              <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0 [overflow-anchor:none]">
                {orderHydrating && existingOrderItems.length === 0 && cart.length === 0 && orderLinesSkeleton}
                {existingOrderItems.length > 0 && (
                  <>
                    {existingOrderItems.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-lg p-2.5 shadow-md border-2 bg-gradient-to-br from-orange-50 to-red-50 border-orange-300"
                      >
                        <div className="flex items-start justify-between mb-1.5">
                          <div className="flex-1">
                            <h4 className="font-bold text-slate-800 text-base leading-tight">{(item as any).products?.name || 'Ürün'}</h4>
                            {(item as any).variant_name && !isWeightVariantLabel((item as any).variant_name) && (
                              <span className="text-sm text-orange-600 font-bold bg-orange-100 px-2 py-0.5 rounded mt-1 inline-block">{(item as any).variant_name}</span>
                            )}
                            {getPersistedWeightLabel(item as any) ? (
                              <div className="text-xs text-emerald-700 font-bold mt-1">
                                Gramaj: {getPersistedWeightLabel(item as any)}
                              </div>
                            ) : null}
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => { setExistingItemNoteModal({ itemId: item.id, currentNote: (item as any).notes || '' }); setExistingNoteInput((item as any).notes || ''); }}
                              className={`p-2 rounded-lg transition-all active:scale-90 ${(item as any).notes ? 'text-blue-500 bg-blue-50 hover:bg-blue-100' : 'text-gray-300 hover:text-gray-500 hover:bg-gray-50'}`}
                              title="Not ekle"
                            >
                              <MessageSquare className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => promptCancelExistingItem(item.id)}
                              className="text-red-500 hover:text-red-700 p-2 hover:bg-red-100 rounded-lg transition-all active:scale-90"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                        {(item as any).notes && (
                          <div className="mb-1.5 text-xs text-blue-600 font-medium bg-blue-50 rounded px-2 py-1">Not: {(item as any).notes}</div>
                        )}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <button
                              onPointerDown={() => updateExistingItemQuantity(item.id, item.quantity - 1)}
                              className="w-9 h-9 bg-orange-200 rounded-lg flex items-center justify-center hover:bg-orange-300 transition-all active:scale-90"
                            >
                              <Minus className="w-4 h-4" />
                            </button>
                            <span className="w-7 text-center font-bold text-sm">{item.quantity}</span>
                            <button
                              onPointerDown={() => updateExistingItemQuantity(item.id, item.quantity + 1)}
                              className="w-9 h-9 bg-gradient-to-br from-orange-500 to-red-600 text-white rounded-lg flex items-center justify-center hover:shadow-lg transition-all active:scale-90"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          </div>
                          <span className="font-bold text-sm text-orange-600">
                            {(item.unit_price * item.quantity).toFixed(0)} ₺
                          </span>
                        </div>
                      </div>
                    ))}
                  </>
                )}

                {cart.length > 0 && (
                  <>
                    {cart.map((item) => {
                      const basePrice = item.product.price;
                      const variantPrice = item.variant ? item.variant.price_modifier : 0;
                      const finalPrice = basePrice + variantPrice;

                      return (
                        <div key={`${item.product.id}-${item.variant?.id || 'none'}`} className="bg-white border-2 border-orange-200 rounded-lg p-2.5 shadow-md">
                          <div className="flex items-start justify-between mb-1.5">
                            <div className="flex-1">
                              <h4 className="font-bold text-slate-800 text-base leading-tight">{item.product.name}</h4>
                              {item.variant && (
                                <span className="text-sm text-orange-600 font-bold bg-orange-100 px-2 py-0.5 rounded mt-1 inline-block">{item.variant.name}</span>
                              )}
                              {item.weight ? (
                                <div className="text-xs text-emerald-700 font-bold mt-1">
                                  Gramaj: {formatWeightLabel(item.weight)}
                                </div>
                              ) : null}
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => { setNoteModal({ productId: item.product.id, variantId: item.variant?.id, currentNote: item.notes || '' }); setNoteInput(item.notes || ''); }}
                                className={`p-2 rounded-lg transition-all active:scale-90 ${item.notes ? 'text-blue-500 bg-blue-50 hover:bg-blue-100' : 'text-gray-300 hover:text-gray-500 hover:bg-gray-50'}`}
                                title="Not ekle"
                              >
                                <MessageSquare className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => promptCancelCartItem(item.product.id, item.variant?.id)}
                                className="text-red-500 hover:text-red-700 p-2 hover:bg-red-50 rounded-lg transition-all active:scale-90"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                          {item.notes && (
                            <div className="mb-1.5 text-xs text-blue-600 font-medium bg-blue-50 rounded px-2 py-1">Not: {item.notes}</div>
                          )}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <button
                                onPointerDown={() => removeFromCart(item.product.id, item.variant?.id)}
                                className="w-9 h-9 bg-orange-200 rounded-lg flex items-center justify-center hover:bg-orange-300 transition-all active:scale-90"
                              >
                                <Minus className="w-4 h-4" />
                              </button>
                              <span className="w-7 text-center font-bold text-sm">{item.quantity}</span>
                              <button
                                onPointerDown={() => addToCart(item.product, item.variant)}
                                className="w-9 h-9 bg-gradient-to-br from-orange-500 to-red-600 text-white rounded-lg flex items-center justify-center hover:shadow-lg transition-all active:scale-90"
                              >
                                <Plus className="w-4 h-4" />
                              </button>
                            </div>
                            <span className="font-bold text-orange-600 text-sm">
                              {(finalPrice * item.quantity).toFixed(0)} ₺
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}

                {cart.length === 0 && existingOrderItems.length === 0 && (
                  orderHydrating ? (
                    orderLinesSkeleton
                  ) : (
                    <p className="text-slate-400 text-center py-6 text-sm">Sipariş yok</p>
                  )
                )}
              </div>

              <div className="p-4 bg-white border-t space-y-3 shrink-0">
                <div className="space-y-1">
                  {discount > 0 && (
                    <div className="flex justify-between text-sm text-green-600">
                      <span className="font-medium">İskonto ({discount}%):</span>
                      <span className="font-bold">-{discountAmount.toFixed(0)} ₺</span>
                    </div>
                  )}
                  <div className="flex justify-between text-xl pt-1.5 border-t-2">
                    <span className="font-bold">TOPLAM:</span>
                    <span className="font-bold text-orange-600">{total.toFixed(0)} ₺</span>
                  </div>
                </div>

                {paymentTransactions.length > 0 && currentOrder && (
                  <div className="pb-2 border-b">
                    <h4 className="text-xs font-bold text-slate-700 mb-1">Ödemeler</h4>
                    <div className="space-y-1 max-h-24 overflow-y-auto">
                      {paymentTransactions.map((payment) => (
                        <div key={payment.id} className="bg-green-50 border border-green-200 rounded p-1.5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1">
                              {payment.payment_method === 'cash' && <Banknote className="w-3 h-3 text-green-600" />}
                              {payment.payment_method === 'credit_card' && <CreditCard className="w-3 h-3 text-green-600" />}
                              {payment.payment_method === 'open_account' && <Receipt className="w-3 h-3 text-green-600" />}
                              <span className="text-xs font-bold">
                                {payment.payment_method === 'cash' && 'Nakit'}
                                {payment.payment_method === 'credit_card' && 'Kart'}
                                {payment.payment_method === 'open_account' && 'Veresiye'}
                              </span>
                            </div>
                            <span className="font-bold text-green-700 text-xs">{Number(payment.amount).toFixed(0)} ₺</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-1 pt-1 border-t border-slate-200">
                      <div className="flex justify-between text-xs font-bold">
                        <span>Ödenen:</span>
                        <span className="text-green-600">{totalPaid.toFixed(0)} ₺</span>
                      </div>
                      <div className="flex justify-between text-xs font-bold text-orange-600 mt-0.5">
                        <span>Kalan:</span>
                        <span>{remainingAmount.toFixed(0)} ₺</span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex gap-2">
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        const hasCart = cart.length > 0;
                        flushSync(() => {
                          onClose();
                        });
                        void unlockTable();
                        if (hasCart) void handleSubmitOrder({ closeWithoutUi: true });
                      }}
                      className="flex-1 bg-gradient-to-r from-slate-600 to-slate-700 hover:from-slate-700 hover:to-slate-800 text-white font-bold py-4 rounded-xl transition-colors duration-75 shadow-lg text-base active:scale-95"
                    >
                      KAPAT
                    </button>
                      {hasOrderContext && (
                        <button
                          onClick={async () => {
                            if (!currentOrder) return;
                            const printSettings = loadPrintSettings();
                            const tableLabel = table.table_number === 0 ? 'Paket' : `Masa ${table.table_number}`;
                            const { discountAmount, total } = calculateTotal();
                            const html = buildReceiptHtml({
                              restaurantName: printSettings.restaurantName || tenant?.name || 'ŞefPOS',
                              restaurantPhone: printSettings.restaurantPhone,
                              restaurantAddress: printSettings.restaurantAddress,
                              tableLabel,
                              orderNumber: currentOrder.order_number,
                              items: existingOrderItems.map(item => ({
                                productName: (item as any).products?.name || '',
                                variantName: (item as any).variant_name || null,
                                quantity: item.quantity,
                                unitPrice: item.unit_price,
                                totalAmount: item.total_amount,
                                notes: (item as any).notes || null,
                              })),
                              subtotal: currentOrder.subtotal,
                              taxAmount: currentOrder.tax_amount,
                              discountAmount,
                              total,
                              footer: printSettings.receiptFooter,
                            });
                            printHtml(html, printSettings.defaultReceiptPrinter || '');
                          }}
                          className="px-3 bg-gradient-to-r from-slate-500 to-slate-600 hover:from-slate-600 hover:to-slate-700 text-white font-bold py-4 rounded-xl transition-colors duration-75 shadow-lg active:scale-95 flex items-center gap-1.5"
                          title="Adisyon Yazdır"
                          disabled={!currentOrder}
                        >
                          <Printer className="w-5 h-5" />
                        </button>
                      )}
                      {hasOrderContext && permissions.can_process_payments && (
                        <button
                          onClick={async () => {
                            if (payButtonBlocked || payOpening) return;
                            if (!currentOrder?.id || isTempOrderId(currentOrder.id)) {
                              alert('Sipariş sunucuya yazılıyor; birkaç saniye bekleyin.');
                              return;
                            }
                            setPayOpening(true);
                            try {
                              const canPay = await lockTableForPayment();
                              if (canPay) setShowPayment(true);
                            } finally {
                              setPayOpening(false);
                            }
                          }}
                          disabled={payButtonBlocked || submitBusy || payOpening}
                          className="flex-1 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white font-bold py-4 rounded-xl transition-colors duration-75 shadow-lg text-base active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
                        >
                          {payOpening ? 'AÇILIYOR...' : (remainingAmount > 0 ? `ÖDE ${remainingAmount.toFixed(0)}₺` : 'ÖDE')}
                        </button>
                      )}
                    </>
                </div>
              </div>
            </div>
          </div>
          )}
        </div>
      </div>
    </>
  );
}
