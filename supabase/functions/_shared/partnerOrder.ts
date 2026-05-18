// deno-lint-ignore-file no-explicit-any

/** Paket/teslimat siparişi — kurumsal partner REST yanıtı. */
export interface PartnerOrderDto {
  id: string;
  order_number: string | null;
  type: string;
  subtype: string | null;
  status: string;
  delivery_status: string | null;
  created_at: string;
  customer: {
    name: string | null;
    phone: string | null;
    address: string | null;
    note: string | null;
  };
  payment: {
    method: string | null;
    collected: boolean;
    status: string | null;
    subtotal: number;
    total: number;
  };
  delivery: {
    estimated_minutes: number | null;
    courier_id: string | null;
    courier_name: string | null;
    assigned_at: string | null;
    picked_up_at: string | null;
    delivered_at: string | null;
  };
  branch: {
    id: string | null;
    name: string | null;
  };
  restaurant: {
    tenant_id: string;
    partner_reference: string | null;
  };
  partner: {
    name: string;
  };
  items: Array<{
    id: string;
    product_id: string | null;
    name: string;
    sku: string | null;
    quantity: number;
    unit_price: number;
    line_total: number;
    tax_rate: number | null;
    notes: string | null;
  }>;
  synced: {
    acked: boolean;
    acked_at: string | null;
  };
}

export function isPartnerPackageOrder(row: {
  order_type?: string | null;
  order_subtype?: string | null;
  table_id?: string | null;
}): boolean {
  if (row.table_id != null) return false;
  const t = String(row.order_type || "");
  if (t === "delivery") return true;
  if (t === "takeaway" && row.order_subtype !== "gel_al") return true;
  return false;
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function productName(item: any): string {
  const p = item?.products;
  if (Array.isArray(p)) return String(p[0]?.name ?? "Ürün");
  return String(p?.name ?? "Ürün");
}

function productSku(item: any): string | null {
  const p = item?.products;
  if (Array.isArray(p)) return p[0]?.sku ? String(p[0].sku) : null;
  return p?.sku ? String(p.sku) : null;
}

export function mapOrderToPartnerDto(
  order: any,
  client: {
    tenant_id: string;
    partner_name: string;
    partner_reference?: string | null;
  },
  ackedAt: string | null,
): PartnerOrderDto {
  const items = (order.order_items || []).map((it: any) => ({
    id: String(it.id),
    product_id: it.product_id ? String(it.product_id) : null,
    name: productName(it),
    sku: productSku(it),
    quantity: num(it.quantity),
    unit_price: num(it.unit_price),
    line_total: num(it.total_amount ?? it.subtotal),
    tax_rate: it.tax_rate != null ? num(it.tax_rate) : null,
    notes: it.notes ? String(it.notes) : null,
  }));

  const branch = order.branches;
  const branchName = Array.isArray(branch) ? branch[0]?.name : branch?.name;

  return {
    id: String(order.id),
    order_number: order.order_number != null ? String(order.order_number) : null,
    type: String(order.order_type || ""),
    subtype: order.order_subtype ? String(order.order_subtype) : null,
    status: String(order.status || "active"),
    delivery_status: order.delivery_status ? String(order.delivery_status) : null,
    created_at: String(order.created_at),
    customer: {
      name: order.customer_name ? String(order.customer_name) : null,
      phone: order.customer_phone ? String(order.customer_phone) : null,
      address: order.delivery_address ? String(order.delivery_address) : null,
      note: order.delivery_note ? String(order.delivery_note) : null,
    },
    payment: {
      method: order.payment_method ? String(order.payment_method) : null,
      collected: Boolean(order.payment_collected),
      status: order.payment_status ? String(order.payment_status) : null,
      subtotal: num(order.subtotal),
      total: num(order.total_amount),
    },
    delivery: {
      estimated_minutes: order.estimated_delivery_minutes != null
        ? num(order.estimated_delivery_minutes)
        : null,
      courier_id: order.courier_id ? String(order.courier_id) : null,
      courier_name: order.courier_name ? String(order.courier_name) : null,
      assigned_at: order.assigned_at ? String(order.assigned_at) : null,
      picked_up_at: order.picked_up_at ? String(order.picked_up_at) : null,
      delivered_at: order.delivered_at ? String(order.delivered_at) : null,
    },
    branch: {
      id: order.branch_id ? String(order.branch_id) : null,
      name: branchName ? String(branchName) : null,
    },
    restaurant: {
      tenant_id: String(client.tenant_id),
      partner_reference: client.partner_reference
        ? String(client.partner_reference)
        : null,
    },
    partner: {
      name: String(client.partner_name),
    },
    items,
    synced: {
      acked: Boolean(ackedAt),
      acked_at: ackedAt,
    },
  };
}
