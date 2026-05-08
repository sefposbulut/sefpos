import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

/**
 * Tenant'a ait aktif hammaddelerden current_stock <= min_stock olanların sayısını
 * verir. ingredients tablosunda realtime aboneliği ile anında günceller.
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
      const { data, error } = await supabase
        .from('ingredients')
        .select('id', { count: 'exact', head: false })
        .eq('tenant_id', tenant.id)
        .eq('is_active', true)
        .filter('current_stock', 'lte', 'min_stock' as any);
      // PostgREST `.filter('a','lte','b')` will treat 'min_stock' literally; bunun yerine
      // tüm aktifleri çekip JS'te filtreleyelim.
      if (error) return;
      if (!data) return;
      // fallback: re-query
      const { data: full } = await supabase
        .from('ingredients')
        .select('current_stock, min_stock')
        .eq('tenant_id', tenant.id)
        .eq('is_active', true);
      if (!mounted) return;
      if (full) {
        const c = (full as any[]).filter((r) => Number(r.current_stock) <= Number(r.min_stock || 0)).length;
        setCount(c);
      }
    };

    void refresh();

    const ch = supabase
      .channel(`ingredients-critical-${tenant.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ingredients', filter: `tenant_id=eq.${tenant.id}` },
        () => { void refresh(); },
      )
      .subscribe();

    const timer = setInterval(() => { void refresh(); }, 60_000);

    return () => {
      mounted = false;
      try { supabase.removeChannel(ch); } catch { /* noop */ }
      clearInterval(timer);
    };
  }, [tenant?.id]);

  return count;
}
