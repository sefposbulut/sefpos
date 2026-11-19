/**
 * Kurumsal partner REST — eski Supabase partner-orders-api karşılığı.
 * GET/POST/PATCH /vds-api/integrations/partner/...
 */
'use strict';

const crypto = require('crypto');

const API_VERSION = '1.0.0';
const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;
const DELIVERY_STATUSES = new Set([
  'pending', 'preparing', 'ready', 'assigned', 'on_the_way',
  'picked_up', 'delivered', 'failed', 'cancelled',
]);

function isPartnerPackageOrder(row) {
  if (row.table_id != null) return false;
  const t = String(row.order_type || '');
  if (t === 'delivery') return true;
  if (t === 'takeaway' && row.order_subtype !== 'gel_al') return true;
  return false;
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function mapOrder(order, items, client, ackedAt) {
  return {
    id: String(order.id),
    order_number: order.order_number != null ? String(order.order_number) : null,
    type: String(order.order_type || ''),
    subtype: order.order_subtype ? String(order.order_subtype) : null,
    status: String(order.status || 'active'),
    delivery_status: order.delivery_status ? String(order.delivery_status) : null,
    created_at: order.created_at,
    customer: {
      name: order.customer_name || null,
      phone: order.customer_phone || null,
      address: order.delivery_address || order.customer_address || null,
      note: order.delivery_note || null,
    },
    payment: {
      method: order.payment_method || null,
      collected: !!order.payment_collected,
      status: order.payment_status || null,
      subtotal: num(order.subtotal),
      total: num(order.total_amount),
    },
    delivery: {
      estimated_minutes: order.estimated_delivery_minutes != null ? num(order.estimated_delivery_minutes) : null,
      courier_id: order.courier_id || null,
      courier_name: order.courier_name || null,
      assigned_at: order.assigned_at || null,
      picked_up_at: order.picked_up_at || null,
      delivered_at: order.delivered_at || null,
    },
    branch: { id: order.branch_id || null, name: order.branch_name || null },
    restaurant: { tenant_id: client.tenant_id, partner_reference: client.partner_reference || null },
    partner: { name: client.partner_name },
    items: (items || []).map((it) => ({
      id: String(it.id),
      product_id: it.product_id ? String(it.product_id) : null,
      name: String(it.product_name || it.name || 'Ürün'),
      sku: it.sku || null,
      quantity: num(it.quantity),
      unit_price: num(it.unit_price),
      line_total: num(it.total_amount),
      tax_rate: it.tax_rate != null ? num(it.tax_rate) : null,
      notes: it.notes || null,
    })),
    synced: { acked: !!ackedAt, acked_at: ackedAt || null },
  };
}

function extractApiKey(req) {
  const direct = req.headers['x-api-key'];
  if (direct && String(direct).trim()) return String(direct).trim();
  const auth = req.headers.authorization || '';
  const m = String(auth).match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

function requestId(req) {
  return req.headers['x-request-id'] || crypto.randomUUID();
}

function createVdsPartnerApi({ runSql }) {
  async function resolveClient(apiKey) {
    const rows = await runSql(
      `SELECT TOP 1 id, tenant_id, branch_id, partner_name, partner_reference, api_key, is_active
       FROM partner_api_clients WHERE api_key = @k AND is_active = 1`,
      { k: { value: apiKey } },
    );
    return rows && rows[0] ? rows[0] : null;
  }

  async function loadItems(orderIds) {
    if (!orderIds.length) return [];
    const params = {};
    const ph = orderIds.map((id, i) => {
      const n = `oid${i}`;
      params[n] = { value: id };
      return `@${n}`;
    }).join(',');
    return runSql(
      `SELECT oi.id, oi.order_id, oi.product_id, oi.quantity, oi.unit_price, oi.total_amount, oi.tax_rate, oi.notes,
              p.name AS product_name, p.barcode AS sku
       FROM order_items oi
       LEFT JOIN products p ON p.id = oi.product_id
       WHERE oi.order_id IN (${ph})`,
      params,
    );
  }

  async function handle(req, res, path, method, sendJson, readBody) {
    const rid = requestId(req);
    const cors = {
      'Access-Control-Allow-Origin': 'https://sefpos.com.tr',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Api-Key, X-Request-Id',
      'X-Request-Id': rid,
    };
    const json = (status, obj) => {
      const body = JSON.stringify(obj);
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...cors });
      res.end(body);
    };
    const err = (code, message, status, details) =>
      json(status, { error: { code, message, details: details || undefined }, request_id: rid });

    if (method === 'OPTIONS') {
      res.writeHead(204, cors);
      return res.end();
    }

    const rest = path.replace(/^\/integrations\/partner\/?/, '/') || '/';
    const clean = rest.replace(/\/+$/, '') || '/';

    if (clean === '/' && method === 'GET') {
      return json(200, {
        service: 'sefpos-partner-orders-api',
        provider: 'ŞefPOS / SEFPOS',
        api_version: API_VERSION,
        vds: true,
        endpoints: [
          'GET /v1/orders',
          'GET /v1/orders/{id}',
          'POST /v1/orders/{id}/ack',
          'PATCH /v1/orders/{id}/delivery',
        ],
        auth: 'Authorization: Bearer <api_key> veya X-Api-Key',
      });
    }

    const apiKey = extractApiKey(req);
    if (!apiKey) return err('UNAUTHORIZED', 'API anahtarı gerekli (Bearer veya X-Api-Key).', 401);

    let client;
    try {
      client = await resolveClient(apiKey);
    } catch (e) {
      return err('INTERNAL', e.message || 'İstemci okunamadı', 500);
    }
    if (!client) return err('UNAUTHORIZED', 'Geçersiz veya pasif API anahtarı.', 401);

    try {
      await runSql(
        `UPDATE partner_api_clients SET last_used_at = GETUTCDATE() WHERE id = @id`,
        { id: { value: client.id } },
      );
    } catch {
      /* last_used opsiyonel */
    }

    const u = new URL(req.url, 'http://127.0.0.1');

    if (clean === '/v1/orders' && method === 'GET') {
      const since = u.searchParams.get('since');
      const includeAcked = u.searchParams.get('include_acked') === 'true';
      const statusFilter = u.searchParams.get('status');
      let limit = parseInt(u.searchParams.get('limit') || String(DEFAULT_LIMIT), 10);
      if (!Number.isFinite(limit) || limit < 1) limit = DEFAULT_LIMIT;
      if (limit > MAX_LIMIT) limit = MAX_LIMIT;
      const hours = parseInt(u.searchParams.get('hours') || '24', 10);
      const safeHours = Number.isFinite(hours) && hours > 0 && hours <= 168 ? hours : 24;
      const fromIso = since && !Number.isNaN(new Date(since).getTime())
        ? new Date(since).toISOString()
        : new Date(Date.now() - safeHours * 3600 * 1000).toISOString();

      const params = {
        tid: { value: client.tenant_id },
        from: { value: fromIso },
      };
      let extra = '';
      if (client.branch_id) {
        extra += ' AND o.branch_id = @bid';
        params.bid = { value: client.branch_id };
      }
      if (statusFilter === 'active') extra += ` AND o.status NOT IN (N'completed', N'cancelled')`;
      else if (statusFilter === 'open') extra += ` AND o.status = N'active'`;

      const rows = await runSql(
        `SELECT TOP ${limit * 3} o.*, b.name AS branch_name
         FROM orders o
         LEFT JOIN branches b ON b.id = o.branch_id
         WHERE o.tenant_id = @tid AND o.table_id IS NULL
           AND o.order_type IN (N'delivery', N'takeaway')
           AND o.created_at >= @from ${extra}
         ORDER BY o.created_at ASC`,
        params,
      );
      const eligible = (rows || []).filter(isPartnerPackageOrder);
      const ids = eligible.map((o) => String(o.id));
      const acks = ids.length
        ? await runSql(
          `SELECT order_id, acked_at FROM partner_api_order_acks WHERE client_id = @cid AND order_id IN (${
            ids.map((_, i) => `@a${i}`).join(',')
          })`,
          Object.assign({ cid: { value: client.id } }, Object.fromEntries(ids.map((id, i) => [`a${i}`, { value: id }]))),
        )
        : [];
      const ackMap = new Map((acks || []).map((a) => [String(a.order_id), a.acked_at]));
      let filtered = includeAcked ? eligible : eligible.filter((o) => !ackMap.has(String(o.id)));
      filtered = filtered.slice(0, limit);
      const items = await loadItems(filtered.map((o) => String(o.id)));
      const byOrder = new Map();
      for (const it of items || []) {
        const k = String(it.order_id);
        if (!byOrder.has(k)) byOrder.set(k, []);
        byOrder.get(k).push(it);
      }
      const orders = filtered.map((o) => mapOrder(o, byOrder.get(String(o.id)) || [], client, ackMap.get(String(o.id)) || null));
      return json(200, {
        api_version: API_VERSION,
        request_id: rid,
        partner: client.partner_name,
        count: orders.length,
        orders,
        next_since: orders.length ? orders[orders.length - 1].created_at : null,
        polling_hint_seconds: 30,
      });
    }

    const one = clean.match(/^\/v1\/orders\/([0-9a-f-]{36})(?:\/(ack|delivery))?$/i);
    if (!one) return err('NOT_FOUND', 'Bilinmeyen partner API yolu.', 404);
    const orderId = one[1];
    const action = one[2] || '';

    const oParams = { id: { value: orderId }, tid: { value: client.tenant_id } };
    let oExtra = '';
    if (client.branch_id) {
      oExtra = ' AND o.branch_id = @bid';
      oParams.bid = { value: client.branch_id };
    }
    const found = await runSql(
      `SELECT TOP 1 o.*, b.name AS branch_name FROM orders o
       LEFT JOIN branches b ON b.id = o.branch_id
       WHERE o.id = @id AND o.tenant_id = @tid ${oExtra}`,
      oParams,
    );
    const order = found && found[0];
    if (!order || !isPartnerPackageOrder(order)) {
      return err('NOT_FOUND', 'Sipariş bulunamadı veya paket kapsamı dışında.', 404);
    }

    if (!action && method === 'GET') {
      const items = await loadItems([orderId]);
      const acks = await runSql(
        `SELECT TOP 1 acked_at FROM partner_api_order_acks WHERE client_id = @cid AND order_id = @oid`,
        { cid: { value: client.id }, oid: { value: orderId } },
      );
      const ackedAt = acks && acks[0] ? acks[0].acked_at : null;
      return json(200, {
        api_version: API_VERSION,
        request_id: rid,
        partner: client.partner_name,
        order: mapOrder(order, items, client, ackedAt),
      });
    }

    if (action === 'ack' && method === 'POST') {
      const now = new Date().toISOString();
      await runSql(
        `IF EXISTS (SELECT 1 FROM partner_api_order_acks WHERE client_id = @cid AND order_id = @oid)
           UPDATE partner_api_order_acks SET acked_at = @ts, ack_source = N'api' WHERE client_id = @cid AND order_id = @oid
         ELSE
           INSERT INTO partner_api_order_acks (id, client_id, order_id, acked_at, ack_source)
           VALUES (@id, @cid, @oid, @ts, N'api')`,
        {
          id: { value: crypto.randomUUID() },
          cid: { value: client.id },
          oid: { value: orderId },
          ts: { value: now },
        },
      );
      return json(200, { api_version: API_VERSION, request_id: rid, ok: true, order_id: orderId, acked_at: now });
    }

    if (action === 'delivery' && method === 'PATCH') {
      const body = (await readBody(req)) || {};
      const deliveryStatus = body.delivery_status;
      if (!deliveryStatus || !DELIVERY_STATUSES.has(String(deliveryStatus))) {
        return err('INVALID_BODY', 'delivery_status geçerli bir değer olmalıdır.', 400, { allowed: [...DELIVERY_STATUSES] });
      }
      const updates = {
        st: { value: deliveryStatus },
        id: { value: orderId },
      };
      let setSql = 'delivery_status = @st, updated_at = GETUTCDATE()';
      if (body.courier_name) {
        setSql += ', courier_name = @cn';
        updates.cn = { value: String(body.courier_name) };
      }
      if (body.courier_id) {
        setSql += ', courier_id = @cid2';
        updates.cid2 = { value: String(body.courier_id) };
      }
      if (deliveryStatus === 'delivered') {
        setSql += ', delivered_at = GETUTCDATE(), status = N\'completed\'';
      }
      await runSql(`UPDATE orders SET ${setSql} WHERE id = @id`, updates);
      return json(200, {
        api_version: API_VERSION,
        request_id: rid,
        ok: true,
        order_id: orderId,
        delivery_status: deliveryStatus,
      });
    }

    return err('NOT_FOUND', 'Bilinmeyen partner API yolu.', 404);
  }

  return { handle };
}

module.exports = { createVdsPartnerApi };
