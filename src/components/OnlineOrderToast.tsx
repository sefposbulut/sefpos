import { useEffect, useRef, useState } from 'react';
import { Bell, X, CheckCircle2, ChevronRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
  startContinuousAlert,
  stopContinuousAlert,
  unlockAudio,
} from '../lib/notification';
import { PlatformLogo } from './PlatformLogo';
import { callGetir } from '../lib/getirApi';
import { GETIR_ORDERS_POLLED_EVENT } from './GlobalGetirSync';
import { wantsFrequentGetirSync } from '../lib/pageActivity';

interface ToastOrderItem {
  name: string;
  quantity: number;
}

interface ToastOrder {
  id: string;
  customer_name: string;
  total_amount: number;
  platform_id: string | null;
  platform_name: string;
  platform_code: string;
  platform_order_id: string | null;
  platform_order_number: string | null;
  status: string;
  is_scheduled: boolean;
  items: ToastOrderItem[];
  created_at: string;
}

interface Props {
  /** Tıklayınca yönlendirilecek hedef (Online Siparişler sayfası). */
  onOpenOnlineOrders: () => void;
  /** Şu an aktif olan sayfa anahtarı (App.tsx'teki currentPage). */
  currentPage: string;
}

const NEWISH_STATUSES = new Set(['new', 'scheduled_new', 'verified', 'accepted']);

/**
 * Online sipariş geldiğinde her sayfada çıkan global toast bildirimi.
 *
 * Davranış:
 *   - Tenant için `online_orders` INSERT eventlerini realtime dinler.
 *   - Item'ları ayrıca çeker (en fazla 6 satır gösterilir, kalanı "+N ürün").
 *   - Sağ ALT köşede platform logosu + müşteri adı + ürün listesi + tutar + ONAYLA butonu.
 *   - ONAYLA: Getir ise verify aksiyonu, diğer platformlar için DB'de status='verified'.
 *   - Sürekli zil ile birlikte; toast'a tıklanınca Online Siparişler'e gider.
 *   - X (kapat) zili o sipariş için durdurur ama siparişi listeden silmez.
 *   - Kullanıcı zaten Online Siparişler sayfasındaysa toast gösterilmez.
 */
export function OnlineOrderToast({ onOpenOnlineOrders, currentPage }: Props) {
  const { tenant } = useAuth();
  const [toasts, setToasts] = useState<ToastOrder[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const seenIds = useRef<Set<string>>(new Set());
  const platformCache = useRef<Map<string, { code: string; name: string }>>(new Map());

  useEffect(() => {
    if (currentPage === 'online-orders' && toasts.length > 0) {
      setToasts([]);
    }
  }, [currentPage, toasts.length]);

  useEffect(() => {
    if (!tenant) return;
    const fetchPlatform = async (
      platformId: string | null,
    ): Promise<{ code: string; name: string }> => {
      if (!platformId) return { code: '', name: 'Online' };
      const cached = platformCache.current.get(platformId);
      if (cached) return cached;
      try {
        const { data } = await supabase
          .from('online_order_platforms')
          .select('platform_code, platform_name')
          .eq('id', platformId)
          .maybeSingle();
        const result = {
          code: data?.platform_code || '',
          name: data?.platform_name || 'Online',
        };
        platformCache.current.set(platformId, result);
        return result;
      } catch {
        return { code: '', name: 'Online' };
      }
    };

    const fetchItemsOnce = async (orderId: string): Promise<ToastOrderItem[]> => {
      try {
        const { data } = await supabase
          .from('online_order_items')
          .select('platform_product_name, quantity')
          .eq('online_order_id', orderId)
          .limit(10);
        return (data || []).map((it: any) => ({
          name: it.platform_product_name || 'Ürün',
          quantity: Number(it.quantity) || 1,
        }));
      } catch {
        return [];
      }
    };

    // Items INSERT'i bazen header (online_orders) INSERT'inden birkaç ms
    // sonra geliyor. Boş dönerse 600ms sonra bir kez daha dener.
    const fetchItems = async (orderId: string): Promise<ToastOrderItem[]> => {
      const first = await fetchItemsOnce(orderId);
      if (first.length > 0) return first;
      await new Promise((r) => setTimeout(r, 600));
      return fetchItemsOnce(orderId);
    };

    const pushToastFromRow = async (row: {
      id: string;
      customer_name?: string | null;
      total_amount?: number | null;
      platform_id?: string | null;
      platform_order_id?: string | null;
      platform_order_number?: string | null;
      status?: string;
      getir_is_scheduled?: boolean | null;
      created_at?: string;
    }) => {
      if (!row?.id || seenIds.current.has(row.id)) return;
      if (!NEWISH_STATUSES.has(row.status || '')) return;
      seenIds.current.add(row.id);

      const [plat, items] = await Promise.all([
        fetchPlatform(row.platform_id ?? null),
        fetchItems(row.id),
      ]);
      unlockAudio();
      startContinuousAlert(row.id, plat.name);

      setToasts((prev) => {
        if (prev.some((t) => t.id === row.id)) return prev;
        return [
          ...prev,
          {
            id: row.id,
            customer_name: row.customer_name || 'Müşteri',
            total_amount: Number(row.total_amount || 0),
            platform_id: row.platform_id || null,
            platform_name: plat.name,
            platform_code: plat.code,
            platform_order_id: row.platform_order_id || null,
            platform_order_number: row.platform_order_number || null,
            status: row.status || 'new',
            is_scheduled: !!row.getir_is_scheduled || row.status === 'scheduled_new',
            items,
            created_at: row.created_at || new Date().toISOString(),
          },
        ];
      });
    };

    const channel = supabase
      .channel(`global-online-orders-${tenant.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'online_orders',
          filter: `tenant_id=eq.${tenant.id}`,
        },
        async (payload) => {
          await pushToastFromRow(payload.new as any);
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'online_orders',
          filter: `tenant_id=eq.${tenant.id}`,
        },
        async (payload) => {
          const row = payload.new as any;
          const old = payload.old as any;
          if (!row?.id) return;
          if (old?.status && NEWISH_STATUSES.has(old.status)) return;
          await pushToastFromRow(row);
        },
      )
      .subscribe();

    const onPolled = async () => {
      if (!wantsFrequentGetirSync()) return;
      try {
        const since = new Date(Date.now() - 3 * 60 * 1000).toISOString();
        const { data: rows } = await supabase
          .from('online_orders')
          .select(
            'id, customer_name, total_amount, platform_id, platform_order_id, platform_order_number, status, getir_is_scheduled, created_at',
          )
          .eq('tenant_id', tenant.id)
          .in('status', ['new', 'scheduled_new'])
          .gte('created_at', since)
          .order('created_at', { ascending: false })
          .limit(6);
        for (const row of rows || []) {
          await pushToastFromRow(row as any);
        }
      } catch (e) {
        console.warn('[OnlineOrderToast] poll yedek:', e);
      }
    };
    window.addEventListener(GETIR_ORDERS_POLLED_EVENT, onPolled);

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener(GETIR_ORDERS_POLLED_EVENT, onPolled);
    };
  }, [tenant]);

  if (currentPage === 'online-orders') return null;
  if (toasts.length === 0) return null;

  const handleOpen = (t: ToastOrder) => {
    stopContinuousAlert(t.id);
    onOpenOnlineOrders();
    setToasts((prev) => prev.filter((x) => x.id !== t.id));
  };

  const handleDismiss = (id: string) => {
    stopContinuousAlert(id);
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const handleApprove = async (t: ToastOrder) => {
    setBusyId(t.id);
    try {
      if (t.platform_code === 'getir' && t.platform_id && t.platform_order_id) {
        const action = t.is_scheduled ? 'verify-scheduled' : 'verify';
        const res = await callGetir({
          platformId: t.platform_id,
          action,
          orderId: t.platform_order_id,
        });
        if (!res.ok) {
          alert(`Onay başarısız: ${(res as any)?.data?.message || res.error || 'bilinmeyen hata'}`);
          return;
        }
      } else {
        // Diğer platformlar — DB'de doğrudan onayla
        const { error } = await supabase
          .from('online_orders')
          .update({
            status: 'verified',
            accepted_at: new Date().toISOString(),
          } as any)
          .eq('id', t.id);
        if (error) {
          alert(`Onay başarısız: ${error.message}`);
          return;
        }
      }
      stopContinuousAlert(t.id);
      setToasts((prev) => prev.filter((x) => x.id !== t.id));
    } catch (err: any) {
      alert(`Onay sırasında hata: ${err?.message || err}`);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-[500] flex flex-col gap-3 pointer-events-none max-w-[92vw]">
      {toasts.map((t) => {
        const visibleItems = t.items.slice(0, 6);
        const restCount = Math.max(0, t.items.length - visibleItems.length);
        const isBusy = busyId === t.id;
        return (
          <div
            key={t.id}
            className="pointer-events-auto w-[24rem] rounded-2xl bg-white text-slate-900 shadow-2xl ring-2 ring-orange-400 overflow-hidden animate-[pulse_2.4s_ease-in-out_infinite]"
          >
            {/* Üst bant — platform logosu + müşteri + kapat */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => handleOpen(t)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleOpen(t);
                }
              }}
              className="flex items-start gap-3 bg-gradient-to-br from-orange-500 to-red-600 px-4 py-3 text-white cursor-pointer"
            >
              <div className="shrink-0 rounded-xl bg-white/95 p-1.5 flex items-center justify-center">
                <PlatformLogo code={t.platform_code} name={t.platform_name} size="sm" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <Bell className="h-3.5 w-3.5 text-white animate-pulse" />
                  <span className="text-[10px] font-black uppercase tracking-wider text-white/90">
                    {t.is_scheduled ? 'İleri Tarihli Yeni Sipariş' : 'Yeni Sipariş'}
                  </span>
                </div>
                <p className="truncate text-sm font-black leading-tight">{t.customer_name}</p>
                {t.platform_order_number && (
                  <p className="truncate text-[11px] font-mono text-white/80 mt-0.5">
                    #{t.platform_order_number}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDismiss(t.id);
                }}
                aria-label="Bildirimi kapat"
                className="shrink-0 rounded-md p-1 text-white/80 hover:bg-white/15 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Ürün listesi */}
            {visibleItems.length > 0 && (
              <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 max-h-44 overflow-y-auto">
                <ul className="space-y-1 text-xs text-slate-700">
                  {visibleItems.map((it, idx) => (
                    <li key={idx} className="flex items-baseline gap-2">
                      <span className="font-bold text-orange-700 shrink-0 tabular-nums">
                        {it.quantity}x
                      </span>
                      <span className="truncate">{it.name}</span>
                    </li>
                  ))}
                </ul>
                {restCount > 0 && (
                  <p className="mt-1.5 text-[10px] font-bold text-slate-500">
                    +{restCount} ürün daha
                  </p>
                )}
              </div>
            )}

            {/* Tutar + butonlar */}
            <div className="px-4 py-2.5 flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-[10px] uppercase tracking-wider font-bold text-slate-500">
                  Toplam
                </p>
                <p className="text-lg font-black text-slate-900">
                  {t.total_amount.toFixed(2)} ₺
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleOpen(t)}
                className="px-2.5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition active:scale-95 flex items-center gap-1"
                title="Online Siparişler sayfasında aç"
              >
                Detay
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => handleApprove(t)}
                disabled={isBusy}
                className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black transition active:scale-95 flex items-center gap-1 disabled:opacity-50 shadow-md"
              >
                <CheckCircle2 className={`h-4 w-4 ${isBusy ? 'animate-spin' : ''}`} />
                {isBusy ? 'Onaylanıyor…' : 'ONAYLA'}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
