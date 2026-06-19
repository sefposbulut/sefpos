import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';

export type OnlineOrderRealtimeEvent = {
  eventType: 'INSERT' | 'UPDATE';
  new: Record<string, unknown>;
  old?: Record<string, unknown>;
};

type Listener = (evt: OnlineOrderRealtimeEvent) => void;

const listeners = new Map<string, Set<Listener>>();
const channels = new Map<string, RealtimeChannel>();

function dispatch(tenantId: string, evt: OnlineOrderRealtimeEvent) {
  const set = listeners.get(tenantId);
  if (!set) return;
  for (const fn of set) {
    try {
      fn(evt);
    } catch (e) {
      console.warn('[onlineOrdersRealtimeHub]', e);
    }
  }
}

function ensureChannel(tenantId: string): void {
  if (channels.has(tenantId)) return;
  const ch = supabase
    .channel(`online-orders-hub-${tenantId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'online_orders',
        filter: `tenant_id=eq.${tenantId}`,
      },
      (payload) => {
        dispatch(tenantId, {
          eventType: 'INSERT',
          new: (payload.new || {}) as Record<string, unknown>,
        });
      },
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'online_orders',
        filter: `tenant_id=eq.${tenantId}`,
      },
      (payload) => {
        dispatch(tenantId, {
          eventType: 'UPDATE',
          new: (payload.new || {}) as Record<string, unknown>,
          old: (payload.old || {}) as Record<string, unknown>,
        });
      },
    )
    .subscribe();
  channels.set(tenantId, ch);
}

function teardownChannel(tenantId: string): void {
  const ch = channels.get(tenantId);
  if (!ch) return;
  void supabase.removeChannel(ch);
  channels.delete(tenantId);
}

/** Tek tenant icin tek realtime kanal — toast + liste sayfasi paylasir. */
export function subscribeOnlineOrdersRealtime(
  tenantId: string,
  listener: Listener,
): () => void {
  let set = listeners.get(tenantId);
  if (!set) {
    set = new Set();
    listeners.set(tenantId, set);
  }
  set.add(listener);
  ensureChannel(tenantId);

  return () => {
    const s = listeners.get(tenantId);
    if (!s) return;
    s.delete(listener);
    if (s.size === 0) {
      listeners.delete(tenantId);
      teardownChannel(tenantId);
    }
  };
}
