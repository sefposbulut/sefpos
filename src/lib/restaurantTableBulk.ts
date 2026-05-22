import { supabase } from './supabase';

export type RestaurantTableInsertRow = {
  tenant_id: string;
  branch_id: string | null;
  table_number: string;
  capacity?: number;
  status?: string;
  size?: string;
  group_id?: string | null;
};

/**
 * SQL Server uq_table_tenant_branch_number: ayni sube+numara tekrar eklenmez.
 */
export async function insertRestaurantTablesSkipDuplicates(
  tables: RestaurantTableInsertRow[],
): Promise<{ inserted: number; skipped: number; error?: string }> {
  if (!tables.length) return { inserted: 0, skipped: 0 };

  const tenantId = tables[0].tenant_id;
  const branchId = tables[0].branch_id ?? null;

  let q = supabase
    .from('restaurant_tables')
    .select('table_number')
    .eq('tenant_id', tenantId);

  if (branchId) {
    q = q.eq('branch_id', branchId);
  } else {
    q = q.is('branch_id', null);
  }

  const { data: existing, error: selErr } = await q;
  if (selErr) return { inserted: 0, skipped: 0, error: selErr.message };

  const existingSet = new Set((existing || []).map((r) => String((r as { table_number: string }).table_number)));
  const toInsert = tables.filter((t) => !existingSet.has(String(t.table_number)));
  const skipped = tables.length - toInsert.length;

  if (!toInsert.length) return { inserted: 0, skipped };

  const { error } = await supabase.from('restaurant_tables').insert(toInsert);
  if (error) return { inserted: 0, skipped, error: error.message };
  return { inserted: toInsert.length, skipped };
}
