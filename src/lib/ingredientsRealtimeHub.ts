import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';

type Listener = () => void;

const listeners = new Map<string, Set<Listener>>();
const channels = new Map<string, RealtimeChannel>();

function dispatch(tenantId: string) {
  const set = listeners.get(tenantId);
  if (!set) return;
  for (const fn of set) {
    try {
      fn();
    } catch (e) {
      console.warn('[ingredientsRealtimeHub]', e);
    }
  }
}

function ensureChannel(tenantId: string): void {
  if (channels.has(tenantId)) return;
  const ch = supabase
    .channel(`ingredients-hub-${tenantId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'ingredients', filter: `tenant_id=eq.${tenantId}` },
      () => dispatch(tenantId),
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

/** ingredients tablosu icin tek realtime kanal. */
export function subscribeIngredientsRealtime(tenantId: string, listener: Listener): () => void {
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
