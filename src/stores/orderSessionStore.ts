import { create } from 'zustand';
import type { CartItem } from '../types/posOrder';
import type { Database } from '../lib/supabase';
import type { OrderItemWithProduct } from '../lib/orderOptimistic';

type Order = Database['public']['Tables']['orders']['Row'];

/** Ödeme satırı (Supabase Database tipinde tablo yoksa bile panel kullanır) */
export type PaymentTransactionRow = {
  id: string;
  tenant_id: string;
  order_id: string;
  payment_method: string;
  amount: number;
  created_by: string;
  created_at: string;
};

type SetArg<T> = T | ((prev: T) => T);

function applySet<T>(prev: T, next: SetArg<T>): T {
  return typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
}

export interface OrderSessionState {
  cart: CartItem[];
  existingOrderItems: OrderItemWithProduct[];
  currentOrder: Order | null;
  paymentTransactions: PaymentTransactionRow[];
  setCart: (next: SetArg<CartItem[]>) => void;
  setExistingOrderItems: (next: SetArg<OrderItemWithProduct[]>) => void;
  setCurrentOrder: (next: Order | null) => void;
  setPaymentTransactions: (next: SetArg<PaymentTransactionRow[]>) => void;
  resetOrderSession: () => void;
}

export const useOrderSessionStore = create<OrderSessionState>((set, _get) => ({
  cart: [],
  existingOrderItems: [],
  currentOrder: null,
  paymentTransactions: [],

  setCart: (next) => set((s) => ({ cart: applySet(s.cart, next) })),
  setExistingOrderItems: (next) =>
    set((s) => ({ existingOrderItems: applySet(s.existingOrderItems, next) })),
  setCurrentOrder: (next) => set({ currentOrder: next }),
  setPaymentTransactions: (next) =>
    set((s) => ({ paymentTransactions: applySet(s.paymentTransactions, next) })),

  resetOrderSession: () =>
    set({
      cart: [],
      existingOrderItems: [],
      currentOrder: null,
      paymentTransactions: [],
    }),
}));
