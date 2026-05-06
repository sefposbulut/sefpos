import { supabase } from './supabase';

// N+1 sorgu sorunlarını çözen optimize edilmiş sorgular
export class OptimizedQueries {
  // Tek sorguda tüm masa bilgilerini getir (orders ile birlikte)
  static async fetchTablesWithOrders(tenantId: string, branchId: string) {
    const { data, error } = await supabase
      .from('restaurant_tables')
      .select(`
        id,
        table_number,
        status,
        current_order_id,
        session_start,
        group_id,
        tenant_id,
        branch_id,
        created_at,
        capacity,
        size,
        payment_locked,
        remaining_amount,
        orders!restaurant_tables_current_order_id_fkey(
          id,
          status,
          total_amount,
          payment_status,
          created_at,
          updated_at,
          order_type
        )
      `)
      .eq('tenant_id', tenantId)
      .eq('branch_id', branchId)
      .order('table_number');

    if (error) throw error;
    return data;
  }

  // Tek sorguda tüm sipariş detaylarını getir
  static async fetchOrderWithItems(orderId: string) {
    const { data, error } = await supabase
      .from('orders')
      .select(`
        *,
        order_items(
          *,
          products(*),
          product_variants(*)
        )
      `)
      .eq('id', orderId)
      .single();

    if (error) throw error;
    return data;
  }

  // Batch sipariş güncellemeleri için
  static async batchUpdateTableStatus(tableIds: string[], status: string) {
    const { data, error } = await supabase
      .from('restaurant_tables')
      .update({ status })
      .in('id', tableIds)
      .select();

    if (error) throw error;
    return data;
  }

  // Masa istatistikleri için optimize edilmiş sorgu
  static async fetchTableStats(tenantId: string, branchId: string) {
    const { data, error } = await supabase
      .from('restaurant_tables')
      .select('status, group_id')
      .eq('tenant_id', tenantId)
      .eq('branch_id', branchId);

    if (error) throw error;
    
    // İstemci tarafında istatistikleri hesapla
    const stats = data.reduce((acc: any, table: any) => {
      const key = table.group_id || 'no_group';
      if (!acc[key]) {
        acc[key] = { available: 0, occupied: 0, reserved: 0, total: 0 };
      }
      acc[key].total++;
      acc[key][table.status]++;
      return acc;
    }, {});

    return stats;
  }

  // Aktif siparişleri toplu olarak getir
  static async fetchActiveOrders(tenantId: string, branchId: string) {
    const { data, error } = await supabase
      .from('orders')
      .select(`
        id,
        table_number,
        status,
        total_amount,
        payment_status,
        created_at,
        order_type,
        order_items(
          id,
          quantity,
          price,
          products(name),
          product_variants(name)
        )
      `)
      .eq('tenant_id', tenantId)
      .eq('branch_id', branchId)
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  }
}
