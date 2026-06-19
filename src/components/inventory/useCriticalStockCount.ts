import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { subscribeIngredientsRealtime } from '../../lib/ingredientsRealtimeHub';
import { useAuth } from '../../contexts/AuthContext';

/**
 * Tenant'a ait aktif hammaddelerden current_stock <= min_stock olanların sayısını
 * verir. ingredients tablosunda realtime aboneliği ile anında günceller.
 *
 * Not: PostgREST iki sütunu `current_stock=lte.min_stock` ile kıyaslayamaz; bu yüzden
 * satırlar çekilip istemcide filtrelenir.
 */
export function useCriticalStockCount(): number {
  const { tenant } = useAuth();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!tenant?.id) {
      setCount(0);
      return;
    }
    let mounted = true;

    const refresh = async () => {
      const { data: rows, error } = await supabase
        .from('ingredients')
        .select('current_stock, min_stock')
        .eq('tenant_id', tenant.id)
        .eq('is_active', true);
      if (!mounted) return;
      if (error) {
        setCount(0);
        return;
      }
      const c = (rows || []).filter(
        (r) => Number(r.current_stock) <= Number(r.min_stock ?? 0),
      ).length;
      setCount(c);
    };

    void refresh();

    const unsub = subscribeIngredientsRealtime(tenant.id, () => {
      void refresh();
    });

    return () => {
      mounted = false;
      unsub();
    };
  }, [tenant?.id]);

  return count;
}
