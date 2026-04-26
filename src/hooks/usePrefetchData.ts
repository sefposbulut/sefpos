import { useEffect } from 'react';
import { queryCache } from '../lib/queryCache';

export function usePrefetchData(tenantId: string | null, branchId: string | null) {
  useEffect(() => {
    if (!tenantId || !branchId) return;

    const timeouts: ReturnType<typeof setTimeout>[] = [];

    // Immediate warmup after login
    timeouts.push(setTimeout(() => {
      queryCache.getProductsAndCategories(tenantId, branchId).catch(() => {});
      queryCache.getTableGroups(tenantId, branchId).catch(() => {});
    }, 100));

    // Refresh cache periodically (30 min)
    const interval = setInterval(() => {
      queryCache.getProductsAndCategories(tenantId, branchId).catch(() => {});
      queryCache.getTableGroups(tenantId, branchId).catch(() => {});
    }, 30 * 60 * 1000);

    return () => {
      timeouts.forEach(t => clearTimeout(t));
      clearInterval(interval);
    };
  }, [tenantId, branchId]);
}
