import { useEffect, useRef, useState } from 'react';
import { Bell, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
  startContinuousAlert,
  stopContinuousAlert,
  unlockAudio,
} from '../lib/notification';
import { isSqlServerMode } from '../lib/sqlDb';
import { PlatformLogo } from './PlatformLogo';

interface ToastOrder {
  id: string;
  customer_name: string;
  total_amount: number;
  platform_id: string | null;
  platform_name: string;
  platform_code: string;
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
 *   - Yalnızca "yeni" sayılan statülerde toast gösterir (eski / tamamlanmış
 *     bir kaydın insert olması bildirim üretmez).
 *   - Sürekli zil ile birlikte; toast'a tıklanınca Online Siparişler'e gider
 *     ve zil orada durdurulur.
 *   - X (kapat) zili o sipariş için durdurur ama siparişi listeden silmez.
 *   - Kullanıcı zaten Online Siparişler sayfasındaysa toast gösterilmez
 *     (sayfanın kendi banner / animasyonu var).
 */
export function OnlineOrderToast({ onOpenOnlineOrders, currentPage }: Props) {
  const { tenant } = useAuth();
  const [toasts, setToasts] = useState<ToastOrder[]>([]);
  const seenIds = useRef<Set<string>>(new Set());
  const platformCache = useRef<Map<string, { code: string; name: string }>>(new Map());

  // Online Siparişler ekranına geçince toast'ları temizle (sayfa kendi
  // yönetiyor). Aktif zillere dokunmaz; zil OnlineOrders tarafından
  // mantığa göre kapatılır.
  useEffect(() => {
    if (currentPage === 'online-orders' && toasts.length > 0) {
      setToasts([]);
    }
  }, [currentPage, toasts.length]);

  useEffect(() => {
    if (!tenant) return;
    if (isSqlServerMode()) return;

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
          const row: any = payload.new;
          if (!row?.id) return;
          if (seenIds.current.has(row.id)) return;
          seenIds.current.add(row.id);
          if (!NEWISH_STATUSES.has(row.status)) return;

          const plat = await fetchPlatform(row.platform_id);
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
                created_at: row.created_at,
              },
            ];
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenant]);

  if (currentPage === 'online-orders') return null;
  if (toasts.length === 0) return null;

  const handleOpen = () => {
    onOpenOnlineOrders();
    setToasts([]);
  };

  const handleDismiss = (id: string) => {
    stopContinuousAlert(id);
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <div className="fixed top-4 right-4 z-[400] flex flex-col gap-3 pointer-events-none max-w-[92vw]">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="button"
          tabIndex={0}
          onClick={handleOpen}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleOpen();
            }
          }}
          className="pointer-events-auto select-none w-[22rem] cursor-pointer rounded-2xl bg-gradient-to-br from-orange-600 to-red-600 p-4 text-white shadow-2xl ring-1 ring-white/30 transition-transform hover:scale-[1.02] active:scale-[0.98] animate-[pulse_2s_ease-in-out_infinite]"
        >
          <div className="flex items-start gap-3">
            <div className="shrink-0 rounded-xl bg-white/20 p-2.5">
              <Bell className="h-6 w-6 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-center gap-2">
                <PlatformLogo code={t.platform_code} name={t.platform_name} size="sm" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-white/85">
                  Yeni Sipariş
                </span>
              </div>
              <p className="truncate text-sm font-black leading-tight">{t.customer_name}</p>
              <p className="mt-1 text-xs text-white/90">
                {t.total_amount.toFixed(0)} ₺ — onaylamak için tıkla
              </p>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleDismiss(t.id);
              }}
              aria-label="Bildirimi kapat"
              className="shrink-0 rounded-md p-1 text-white/70 hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
