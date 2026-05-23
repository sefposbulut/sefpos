/** Ödeme sonrası realtime gecikmesiyle masanın tekrar kırmızı/yeşil görünmesini engeller. */
const clearedUntilByTableId = new Map<string, number>();

const DEFAULT_MS = 3500;

export function markTableOptimisticallyCleared(tableId: string, holdMs = DEFAULT_MS): void {
  if (!tableId) return;
  clearedUntilByTableId.set(tableId, Date.now() + holdMs);
}

export function isTableOptimisticClearActive(tableId: string): boolean {
  const until = clearedUntilByTableId.get(tableId);
  if (!until) return false;
  if (Date.now() > until) {
    clearedUntilByTableId.delete(tableId);
    return false;
  }
  return true;
}

type TableLike = {
  status?: string | null;
  current_order_id?: string | null;
  payment_locked?: boolean | null;
  order?: unknown;
};

/** Sunucudan gelen eski satır, az önce boşaltılmış masayı geri kilitlemesin. */
export function isStaleTableSnapshotAfterClear(
  tableId: string,
  local: TableLike,
  incoming: TableLike,
): boolean {
  if (!isTableOptimisticClearActive(tableId)) return false;

  const localEmpty =
    local.status === 'available' &&
    !local.current_order_id &&
    !local.order &&
    !local.payment_locked;

  if (!localEmpty) return false;

  const incomingBusy =
    incoming.payment_locked === true ||
    incoming.status === 'occupied' ||
    !!incoming.current_order_id ||
    !!incoming.order;

  return incomingBusy;
}
