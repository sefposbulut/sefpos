/**
 * ŞefPOS VDS HTTP API — tarayıcı POS'u SQL Server'a bağlar (Supabase yok).
 * Electron sql-query / sql-login / sql-rpc protokolünün HTTP karşılığı.
 *
 * Config: C:\sefpos-deploy\vds-api.json  (veya SEFPOS_VDS_API_CONFIG)
 * Listen: 127.0.0.1:8787 (IIS/PHP aynı makineden proxy eder)
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CONFIG_PATH =
  process.env.SEFPOS_VDS_API_CONFIG ||
  (process.platform === 'win32'
    ? 'C:\\sefpos-deploy\\vds-api.json'
    : path.join(__dirname, 'vds-api.json'));

function loadConfig() {
  let rawText = fs.readFileSync(CONFIG_PATH, 'utf8');
  if (rawText.charCodeAt(0) === 0xfeff) rawText = rawText.slice(1);
  const raw = JSON.parse(rawText);
  if (!raw.database || !raw.user || !raw.password || !raw.secret) {
    throw new Error('vds-api.json: database, user, password, secret zorunlu');
  }
  return raw;
}

const cfg = loadConfig();
const LISTEN_HOST = cfg.listenHost || '127.0.0.1';
const LISTEN_PORT = Number(cfg.listen || 8787);
const TOKEN_TTL_SEC = Number(cfg.tokenTtlSec || 86400);

let sql = null;
let bcrypt = null;
try {
  sql = require('mssql');
} catch (e) {
  console.error('[vds-api] mssql yok:', e.message);
  process.exit(1);
}
try {
  bcrypt = require('bcryptjs');
} catch (e) {
  console.error('[vds-api] bcryptjs yok:', e.message);
  process.exit(1);
}

const pool = new sql.ConnectionPool({
  server: cfg.host || '127.0.0.1',
  port: Number(cfg.port || 1433),
  database: cfg.database,
  user: cfg.user,
  password: cfg.password,
  options: {
    encrypt: cfg.encrypt === true,
    trustServerCertificate: cfg.trustServerCertificate !== false,
    enableArithAbort: true,
  },
  pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const DEFAULT_PERMISSIONS = {
  can_view_tables: true,
  can_take_orders: true,
  can_process_payments: true,
  can_delete_order_items: true,
  can_manage_discounts: true,
  can_manage_products: true,
  can_manage_cash_register: true,
  can_view_reports: true,
  can_end_of_day: true,
  can_view_cancel_logs: true,
  can_manage_users: true,
  can_manage_settings: true,
  can_use_shifts: true,
};

const SQL_ROW_ALLOWLIST = {
  categories: ['id', 'tenant_id', 'name', 'color', 'sort_order', 'display_order', 'image_url', 'vat_rate', 'hugin_department_id', 'hugin_vat_department', 'created_at'],
  products: ['id', 'tenant_id', 'category_id', 'name', 'description', 'barcode', 'price', 'cost', 'stock_quantity', 'unit', 'tax_rate', 'is_active', 'is_available', 'image_url', 'printer_name', 'scale_enabled', 'plu_code', 'scale_prefix', 'created_at', 'updated_at'],
  product_variants: ['id', 'tenant_id', 'product_id', 'name', 'price_modifier', 'sort_order', 'is_active', 'created_at', 'updated_at'],
  order_items: ['id', 'order_id', 'tenant_id', 'product_id', 'variant_id', 'quantity', 'unit_price', 'tax_rate', 'discount_amount', 'total_amount', 'notes', 'variant_name', 'status', 'cancellation_reason', 'cancelled_by', 'cancelled_at', 'paid_quantity', 'paid_at', 'created_at'],
  tenants: ['id', 'name', 'slug', 'address', 'phone', 'email', 'logo_url', 'subscription_status', 'subscription_plan', 'subscription_expires_at', 'max_branches', 'notes', 'onboarding_completed', 'deployment_mode', 'printer_settings', 'require_cancel_reason', 'lock_pin', 'ip_lock_enabled', 'disabled_modules', 'created_at'],
  branches: ['id', 'tenant_id', 'name', 'address', 'phone', 'is_active', 'is_main', 'use_central_products', 'menu_enabled', 'qr_menu_settings', 'default_discount_percent', 'default_discount_active', 'created_at'],
  orders: ['id', 'tenant_id', 'branch_id', 'table_id', 'order_number', 'order_type', 'order_subtype', 'status', 'payment_status', 'payment_method', 'subtotal', 'tax_amount', 'discount_amount', 'total_amount', 'notes', 'waiter_id', 'waiter_name', 'created_by', 'created_at', 'updated_at', 'completed_at', 'paid_at', 'session_id', 'customer_id', 'customer_name', 'customer_phone', 'customer_address', 'delivery_address', 'delivery_note', 'courier_id', 'courier_name', 'estimated_delivery_minutes', 'delivery_status', 'payment_collected', 'delivery_customer_id', 'assigned_at', 'picked_up_at', 'delivered_at'],
  payment_transactions: ['id', 'tenant_id', 'order_id', 'payment_method', 'amount', 'notes', 'created_at', 'created_by', 'customer_id'],
  customer_transactions: ['id', 'tenant_id', 'customer_id', 'order_id', 'type', 'amount', 'description', 'created_by', 'created_at'],
  customers: ['id', 'tenant_id', 'name', 'phone', 'email', 'address', 'tax_number', 'credit_limit', 'current_balance', 'is_active', 'notes', 'created_at', 'updated_at'],
  cash_register_transactions: ['id', 'tenant_id', 'branch_id', 'transaction_type', 'payment_method', 'amount', 'reference_id', 'reference_type', 'description', 'order_number', 'table_name', 'notes', 'created_at', 'created_by', 'shift_id'],
  restaurant_tables: ['id', 'tenant_id', 'branch_id', 'table_number', 'status', 'capacity', 'size', 'group_id', 'current_order_id', 'session_start', 'payment_locked', 'payment_locked_at', 'payment_locked_by_session', 'payment_lock_expires_at', 'created_at'],
  table_groups: ['id', 'tenant_id', 'branch_id', 'name', 'prefix', 'color', 'created_at'],
  print_settings: ['id', 'tenant_id', 'branch_id', 'settings', 'updated_by', 'updated_at', 'created_at'],
  print_jobs: [
    'id',
    'tenant_id',
    'branch_id',
    'job_type',
    'payload',
    'html',
    'printer_name',
    'status',
    'error',
    'created_at',
    'updated_at',
    'printed_at',
  ],
  printer_registrations: ['id', 'tenant_id', 'branch_id', 'printers', 'last_seen_at', 'created_at'],
  branch_product_stocks: ['id', 'tenant_id', 'branch_id', 'product_id', 'quantity', 'updated_at'],
  stock_movements: ['id', 'tenant_id', 'product_id', 'movement_type', 'quantity', 'unit_cost', 'total_cost', 'supplier_name', 'note', 'created_by', 'source_branch_id', 'target_branch_id', 'reference_type', 'reference_no', 'created_at'],
  order_cancel_logs: ['id', 'tenant_id', 'branch_id', 'order_id', 'order_item_id', 'order_number', 'product_name', 'quantity', 'unit_price', 'cancel_reason', 'cancelled_by', 'cancelled_by_name', 'created_at'],
  roles: ['id', 'tenant_id', 'name', 'permissions', 'created_at'],
  profiles: ['id', 'tenant_id', 'branch_id', 'role_id', 'email', 'full_name', 'role', 'avatar_url', 'phone', 'username', 'is_super_admin', 'onboarding_completed', 'allowed_ips', 'is_active', 'created_at'],
  app_users: ['id', 'email', 'password_hash', 'tenant_id', 'created_at'],
  shift_definitions: ['id', 'tenant_id', 'branch_id', 'shift_no', 'name', 'start_time', 'end_time', 'color', 'is_active', 'created_at', 'updated_at'],
  shifts: ['id', 'tenant_id', 'branch_id', 'shift_definition_id', 'shift_no', 'shift_name', 'business_date', 'terminal_id', 'terminal_name', 'opened_by', 'opened_at', 'opening_cash', 'opening_cash_breakdown', 'opening_notes', 'closed_by', 'closed_at', 'closing_cash', 'closing_cash_breakdown', 'closing_notes', 'cash_revenue', 'card_revenue', 'open_account_revenue', 'total_revenue', 'expense_total', 'cash_in_total', 'cash_out_total', 'expected_cash', 'cash_difference', 'order_count', 'status', 'created_at', 'updated_at'],
  daily_closures: ['id', 'tenant_id', 'branch_id', 'business_date', 'closed_by', 'closed_at', 'notes', 'status'],
  ingredients: ['id', 'tenant_id', 'branch_id', 'name', 'unit', 'current_stock', 'min_stock', 'unit_cost', 'default_supplier_id', 'barcode', 'notes', 'is_active', 'created_by', 'created_at', 'updated_at'],
  recipes: ['id', 'tenant_id', 'product_id', 'variant_id', 'ingredient_id', 'quantity', 'unit', 'note', 'created_at'],
  suppliers: ['id', 'tenant_id', 'branch_id', 'name', 'contact_name', 'phone', 'email', 'address', 'tax_no', 'current_balance', 'notes', 'is_active', 'created_by', 'created_at', 'updated_at'],
  purchase_invoices: ['id', 'tenant_id', 'branch_id', 'supplier_id', 'invoice_no', 'invoice_date', 'subtotal', 'tax_amount', 'total_amount', 'paid_amount', 'payment_method', 'notes', 'status', 'created_by', 'created_at', 'updated_at'],
  purchase_invoice_items: ['id', 'invoice_id', 'tenant_id', 'ingredient_id', 'quantity', 'unit_cost', 'total', 'created_at'],
  ingredient_movements: ['id', 'tenant_id', 'ingredient_id', 'movement_type', 'quantity', 'unit_cost', 'reference_type', 'reference_id', 'note', 'created_by', 'created_at'],
  waiters: ['id', 'tenant_id', 'phone', 'pin', 'name', 'status', 'created_at', 'updated_at'],
  waiter_calls: ['id', 'tenant_id', 'branch_id', 'table_label', 'call_type', 'message', 'status', 'created_at', 'resolved_at', 'resolved_by'],
  delivery_customers: ['id', 'tenant_id', 'branch_id', 'name', 'full_name', 'phone', 'address', 'notes', 'last_order_at', 'order_count', 'created_at', 'updated_at'],
  couriers: ['id', 'tenant_id', 'branch_id', 'full_name', 'phone', 'pin', 'pin_code', 'status', 'is_active', 'latitude', 'longitude', 'notification_token', 'location_updated_at', 'created_at'],
  online_orders: ['id', 'tenant_id', 'branch_id', 'platform_id', 'platform_order_id', 'platform_order_number', 'external_id', 'status', 'payment_status', 'customer_name', 'customer_phone', 'customer_address', 'customer_notes', 'delivery_address', 'subtotal', 'total_amount', 'notes', 'accepted_at', 'ready_at', 'delivered_at', 'cancelled_at', 'created_at', 'updated_at'],
  online_order_platforms: ['id', 'tenant_id', 'branch_id', 'platform_name', 'platform_code', 'platform', 'is_active', 'settings', 'webhook_url', 'api_key', 'middleware_url', 'middleware_username', 'middleware_password', 'getir_environment', 'getir_app_secret_key', 'getir_restaurant_secret_key', 'getir_restaurant_id', 'getir_token', 'getir_token_expires_at', 'getir_pos_status', 'getir_restaurant_open', 'created_at', 'updated_at'],
  online_order_items: ['id', 'order_id', 'tenant_id', 'product_name', 'quantity', 'unit_price', 'total_price', 'notes'],
  expenses: ['id', 'tenant_id', 'branch_id', 'amount', 'description', 'category', 'created_by', 'created_at'],
  cash_registers: ['id', 'tenant_id', 'branch_id', 'name', 'is_active', 'created_at'],
  cash_movements: ['id', 'tenant_id', 'cash_register_id', 'movement_type', 'amount', 'description', 'created_by', 'created_at'],
  tenant_licenses: ['id', 'tenant_id', 'license_key', 'status', 'expires_at', 'created_at'],
  loyalty_settings: ['id', 'tenant_id', 'branch_id', 'is_active', 'points_per_amount', 'amount_per_point', 'created_at', 'updated_at'],
  loyalty_transactions: ['id', 'tenant_id', 'customer_id', 'order_id', 'points', 'type', 'created_at'],
  device_bindings: ['id', 'tenant_id', 'branch_id', 'device_fingerprint', 'device_name', 'is_active', 'created_at'],
  order_daily_counters: ['id', 'tenant_id', 'branch_id', 'business_date', 'last_number', 'updated_at'],
  partner_api_clients: ['id', 'tenant_id', 'branch_id', 'partner_name', 'partner_reference', 'api_key', 'api_key_prefix', 'is_active', 'last_used_at', 'created_at'],
  partner_api_order_acks: ['id', 'client_id', 'order_id', 'acked_at', 'ack_source'],
  platform_release_policy: ['id', 'min_required_version', 'force_update', 'message', 'updated_at', 'updated_by'],
  admin_tenant_impersonation: ['id', 'user_id', 'target_tenant_id', 'updated_at'],
  henemyolda_integrations: [
    'id',
    'tenant_id',
    'branch_id',
    'app_name',
    'access_token',
    'is_active',
    'is_test_mode',
    'base_url',
    'last_push_at',
    'created_at',
    'updated_at',
  ],
  henemyolda_webhook_log: [
    'id',
    'integration_id',
    'order_id',
    'action',
    'http_status',
    'success',
    'error_message',
    'request_url',
    'created_at',
  ],
};

function pickSqlRow(table, row) {
  if (!row || typeof row !== 'object') return row;
  const src = { ...row };
  if (table === 'customer_transactions') {
    if (src.note != null && src.description == null) src.description = src.note;
    delete src.note;
  }
  if (table === 'delivery_customers') {
    if (src.full_name == null && src.name != null) src.full_name = src.name;
    delete src.name;
  }
  if (table === 'couriers') {
    if (src.pin_code == null && src.pin != null) src.pin_code = src.pin;
    delete src.pin;
  }
  const allowed = SQL_ROW_ALLOWLIST[table];
  if (!allowed) return src;
  const set = new Set(allowed);
  const out = {};
  for (const [k, v] of Object.entries(src)) {
    if (v === undefined || !set.has(k)) continue;
    if (v === null && (k === 'hugin_department_id' || k === 'vat_rate' || k === 'variant_id' || k === 'description' || k === 'image_url' || k === 'barcode' || k === 'printer_name' || k === 'plu_code' || k === 'scale_prefix')) {
      continue;
    }
    out[k] = v;
  }
  return out;
}

function parseSqlDateTime(val) {
  if (val instanceof Date && !Number.isNaN(val.getTime())) return val;
  if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}/.test(val)) {
    const d = new Date(val);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

function sqlTypeFor(val) {
  if (val === null || val === undefined) return sql.NVarChar;
  if (typeof val === 'string' && UUID_RE.test(val)) return sql.UniqueIdentifier;
  const dt = parseSqlDateTime(val);
  if (dt) return sql.DateTime2;
  if (typeof val === 'boolean') return sql.Bit;
  if (typeof val === 'string' && /^(true|false)$/i.test(val)) return sql.Bit;
  if (typeof val === 'number' && Number.isInteger(val)) return sql.Int;
  if (typeof val === 'number') return sql.Decimal(18, 4);
  return sql.NVarChar(sql.MAX);
}

function normalizeParamValue(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === 'boolean') return val ? 1 : 0;
  if (typeof val === 'string' && /^(true|false)$/i.test(val)) return val.toLowerCase() === 'true' ? 1 : 0;
  const dt = parseSqlDateTime(val);
  if (dt) return dt;
  // disabled_modules / printer_settings gibi JSON alanlar
  if (Array.isArray(val) || (typeof val === 'object' && !(val instanceof Date))) {
    return JSON.stringify(val);
  }
  return val;
}

const JSON_TEXT_COLUMNS = new Set([
  'disabled_modules',
  'printer_settings',
  'permissions',
  'opening_cash_breakdown',
  'closing_cash_breakdown',
  'qr_menu_settings',
  'settings',
  'payload',
  'allowed_ips',
  'printers',
]);

function hydrateSqlRow(row) {
  if (!row || typeof row !== 'object') return row;
  const out = { ...row };
  for (const key of Object.keys(out)) {
    const v = out[key];
    if (typeof v !== 'string') continue;
    if (!JSON_TEXT_COLUMNS.has(key) && !(v.startsWith('[') || v.startsWith('{'))) continue;
    if (!JSON_TEXT_COLUMNS.has(key)) continue;
    try {
      out[key] = JSON.parse(v);
    } catch {
      /* düz metin kalsın */
    }
  }
  return out;
}

function hydrateSqlRows(rows) {
  if (!Array.isArray(rows)) return rows;
  return rows.map(hydrateSqlRow);
}

function bindParams(request, params) {
  for (const [name, spec] of Object.entries(params || {})) {
    const value = spec && Object.prototype.hasOwnProperty.call(spec, 'value') ? spec.value : spec;
    request.input(name, sqlTypeFor(value), normalizeParamValue(value));
  }
}

async function runSql(sqlText, params) {
  const request = pool.request();
  bindParams(request, params);
  const result = await request.query(sqlText);
  return hydrateSqlRows(result.recordset || []);
}

function safeId(c) {
  const parts = String(c).split('.');
  if (parts.length === 2) {
    return `${parts[0].replace(/[^a-zA-Z0-9_]/g, '')}.${parts[1].replace(/[^a-zA-Z0-9_]/g, '')}`;
  }
  return String(c).replace(/[^a-zA-Z0-9_]/g, '');
}

/** UI/PostgREST `note` → SQL Server `description` (customer_transactions). */
function mapSelectColumns(table, select) {
  if (!select || select === '*') {
    if (table === 'customer_transactions') {
      return 'id, tenant_id, customer_id, order_id, type, amount, description AS note, created_by, created_at';
    }
    return '*';
  }
  return (
    String(select)
      .split(',')
      .map((c) => {
        const t = c.trim();
        if (t === '*') return '*';
        if (table === 'customer_transactions' && t === 'note') return 'description AS note';
        return safeId(t);
      })
      .filter(Boolean)
      .join(', ') || '*'
  );
}

function aliasSqlRows(table, rows) {
  if (!rows || table !== 'customer_transactions') return rows;
  return rows.map((r) => {
    if (!r || typeof r !== 'object') return r;
    const out = { ...r };
    if (out.note == null && out.description != null) out.note = out.description;
    return out;
  });
}

function buildWhere(filters, params, prefix) {
  if (!filters || filters.length === 0) return '';
  let pi = Object.keys(params).length;
  const addParam = (val) => {
    const name = `${prefix || 'f'}${pi++}`;
    params[name] = { value: val };
    return `@${name}`;
  };
  const buildCondition = (f) => {
    if (f.op === 'eq') return `${safeId(f.col)} = ${addParam(f.val)}`;
    if (f.op === 'neq') return `${safeId(f.col)} != ${addParam(f.val)}`;
    if (f.op === 'gt') return `${safeId(f.col)} > ${addParam(f.val)}`;
    if (f.op === 'gte') return `${safeId(f.col)} >= ${addParam(f.val)}`;
    if (f.op === 'lt') return `${safeId(f.col)} < ${addParam(f.val)}`;
    if (f.op === 'lte') return `${safeId(f.col)} <= ${addParam(f.val)}`;
    if (f.op === 'is_null') return `${safeId(f.col)} IS NULL`;
    if (f.op === 'is_not_null') return `${safeId(f.col)} IS NOT NULL`;
    if (f.op === 'like') return `${safeId(f.col)} LIKE ${addParam(f.val)}`;
    if (f.op === 'ilike') return `LOWER(${safeId(f.col)}) LIKE LOWER(${addParam(f.val)})`;
    if (f.op === 'in' && Array.isArray(f.val)) {
      if (f.val.length === 0) return '1=0';
      return `${safeId(f.col)} IN (${f.val.map((v) => addParam(v)).join(', ')})`;
    }
    if (f.op === 'not_in' && Array.isArray(f.val)) {
      if (f.val.length === 0) return '1=1';
      return `${safeId(f.col)} NOT IN (${f.val.map((v) => addParam(v)).join(', ')})`;
    }
    if (f.op === 'or' && Array.isArray(f.val)) {
      const orParts = f.val.map(buildCondition).filter(Boolean);
      return orParts.length > 0 ? `(${orParts.join(' OR ')})` : '1=1';
    }
    return '1=1';
  };
  return `WHERE ${filters.map(buildCondition).join(' AND ')}`;
}

function parseSelectWithJoins(selectStr) {
  if (!selectStr || selectStr.trim() === '*') {
    return { mainCols: '*', joins: [] };
  }
  const joins = [];
  const mainCols = [];
  const cleaned = selectStr.replace(/\s+/g, ' ').trim();
  const parseLevel = (str) => {
    const parts = [];
    let depth = 0;
    let current = '';
    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      if (ch === '(') {
        depth++;
        current += ch;
      } else if (ch === ')') {
        depth--;
        current += ch;
      } else if (ch === ',' && depth === 0) {
        parts.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    if (current.trim()) parts.push(current.trim());
    return parts;
  };
  for (const part of parseLevel(cleaned)) {
    const parenIdx = part.indexOf('(');
    if (parenIdx === -1) {
      if (part.trim() === '*' || part.trim() === '') mainCols.push('*');
      else mainCols.push(part.trim().replace(/[^a-zA-Z0-9_]/g, ''));
    } else {
      let relName = part.substring(0, parenIdx).trim();
      const exclamIdx = relName.indexOf('!');
      if (exclamIdx !== -1) relName = relName.substring(0, exclamIdx);
      relName = relName.replace(/[^a-zA-Z0-9_]/g, '');
      const inner = part.substring(parenIdx + 1, part.length - 1).trim();
      const relCols = parseLevel(inner).flatMap((ip) => {
        const pi = ip.indexOf('(');
        if (pi === -1) {
          if (ip.trim() === '*') return ['*'];
          return [ip.trim().replace(/[^a-zA-Z0-9_]/g, '')];
        }
        return ['*'];
      }).filter(Boolean);
      joins.push({ table: relName, cols: relCols.length > 0 ? relCols : ['*'] });
    }
  }
  const hasWildcard = mainCols.includes('*');
  return {
    mainCols: hasWildcard ? '*' : (mainCols.filter(Boolean).join(', ') || '*'),
    joins,
  };
}

function getFkForJoin(mainTable, joinTable) {
  if (joinTable === 'table_groups' && mainTable === 'restaurant_tables') {
    return { fk: 'group_id', pk: 'id', direction: 'parent' };
  }
  if (joinTable === 'branches' && mainTable === 'table_groups') {
    return { fk: 'branch_id', pk: 'id', direction: 'parent' };
  }
  if (joinTable === 'categories' && mainTable === 'products') {
    return { fk: 'category_id', pk: 'id', direction: 'parent' };
  }
  if (joinTable === 'products' && mainTable === 'order_items') {
    return { fk: 'product_id', pk: 'id', direction: 'parent' };
  }
  if (joinTable === 'order_items' && mainTable === 'orders') {
    return { fk: 'order_id', pk: 'id', direction: 'child' };
  }
  if (joinTable === 'orders' && mainTable === 'restaurant_tables') {
    return { fk: 'current_order_id', pk: 'id', direction: 'parent' };
  }
  if (joinTable === 'profiles' && mainTable === 'cash_register_transactions') {
    return { fk: 'user_id', pk: 'id', direction: 'parent' };
  }
  return null;
}

async function execSelectWithJoins(table, select, filters, orderBy, limitVal) {
  const { mainCols, joins } = parseSelectWithJoins(select);
  const prefixedFilters = (filters || []).map((f) => {
    if (!f.col) return f;
    if (f.op === 'or' && Array.isArray(f.val)) {
      return { ...f, val: f.val.map((sub) => (sub.col ? { ...sub, col: `t.${safeId(sub.col)}` } : sub)) };
    }
    return { ...f, col: `t.${safeId(f.col)}` };
  });
  const params = {};
  const where = buildWhere(prefixedFilters, params, 'w');
  const top = limitVal ? `TOP ${parseInt(limitVal, 10)}` : '';
  const order = orderBy && orderBy.length > 0
    ? `ORDER BY ${orderBy.map((o) => `t.${safeId(o.col)} ${o.asc ? 'ASC' : 'DESC'}`).join(', ')}`
    : '';

  if (joins.length === 0) {
    const cols = mainCols === '*' ? '*' : mainCols;
    const parts = ['SELECT', top, cols, 'FROM', safeId(table), where, order].filter(Boolean);
    return runSql(parts.join(' '), params);
  }

  const mainColStr = mainCols === '*' ? 't.*' : mainCols.split(',').map((c) => `t.${c.trim()}`).join(', ');
  const joinClauses = [];
  const joinSelectParts = [mainColStr];
  for (const j of joins) {
    const rel = getFkForJoin(table, j.table);
    if (!rel) continue;
    const isCountOnly = j.cols.length === 1 && j.cols[0] === 'count';
    if (isCountOnly && rel.direction === 'child') {
      const alias = `c_${j.table}`;
      joinSelectParts.push(
        `(SELECT COUNT_BIG(*) FROM ${safeId(j.table)} ${alias} WHERE ${alias}.${safeId(rel.fk)} = t.${safeId(rel.pk)}) AS [${j.table}__count]`,
      );
      continue;
    }
    const alias = `j_${j.table}`;
    if (rel.direction === 'parent') {
      joinClauses.push(`LEFT JOIN ${safeId(j.table)} ${alias} ON t.${safeId(rel.fk)} = ${alias}.${safeId(rel.pk)}`);
    } else {
      joinClauses.push(`LEFT JOIN ${safeId(j.table)} ${alias} ON ${alias}.${safeId(rel.fk)} = t.${safeId(rel.pk)}`);
    }
    const hasStar = j.cols.includes('*');
    const jCols = hasStar
      ? `${alias}.*`
      : j.cols.filter(Boolean).map((c) => `${alias}.${safeId(c)} AS [${j.table}__${safeId(c)}]`).join(', ');
    if (jCols) joinSelectParts.push(jCols);
    const rel2 = getFkForJoin(j.table, 'categories');
    if (rel2) {
      const alias2 = `j_${j.table}_cat`;
      joinClauses.push(`LEFT JOIN categories ${alias2} ON ${alias}.${safeId(rel2.fk)} = ${alias2}.${safeId(rel2.pk)}`);
      for (const cf of ['id', 'name', 'vat_rate', 'hugin_department_id', 'color', 'sort_order']) {
        joinSelectParts.push(`${alias2}.${cf} AS [${j.table}__categories__${cf}]`);
      }
    }
  }
  const q = ['SELECT', top, joinSelectParts.join(', '), 'FROM', `${safeId(table)} t`, ...joinClauses, where || '', order]
    .filter(Boolean).join(' ').trim();
  const rows = await runSql(q, params);
  if (!rows || rows.length === 0) return rows;
  return rows.map((row) => {
    const main = {};
    const nested = {};
    for (const [key, val] of Object.entries(row)) {
      const catNest = key.match(/^(\w+)__categories__(\w+)$/);
      if (catNest) {
        const tbl = catNest[1];
        if (!nested[tbl]) nested[tbl] = {};
        if (!nested[tbl].categories) nested[tbl].categories = {};
        nested[tbl].categories[catNest[2]] = val;
        continue;
      }
      const dblIdx = key.indexOf('__');
      if (dblIdx > -1) {
        const tbl = key.substring(0, dblIdx);
        const col = key.substring(dblIdx + 2);
        if (!nested[tbl]) nested[tbl] = {};
        nested[tbl][col] = val;
      } else {
        main[key] = val;
      }
    }
    for (const [tbl, data] of Object.entries(nested)) {
      const { categories: catSub, ...rest } = data;
      if (Object.keys(rest).length === 1 && Object.prototype.hasOwnProperty.call(rest, 'count')) {
        main[tbl] = [{ count: Number(rest.count) || 0 }];
        continue;
      }
      const allNull = Object.values(rest).every((v) => v === null);
      const base = allNull ? {} : rest;
      if (catSub && !Object.values(catSub).every((v) => v === null)) base.categories = catSub;
      main[tbl] = Object.keys(base).length === 0 ? null : base;
    }
    return main;
  });
}

async function sqlSelectRowById(table, id) {
  const rows = await runSql(`SELECT * FROM ${safeId(table)} WHERE id = @rid`, { rid: { value: id } });
  return rows && rows[0] ? rows[0] : null;
}

async function sqlInsertRowSafe(table, filteredRow) {
  const keys = Object.keys(filteredRow);
  const params = {};
  keys.forEach((k, i) => {
    params[`i${i}`] = { value: filteredRow[k] };
  });
  const colList = keys.map((k) => safeId(k)).join(', ');
  const valList = keys.map((_, i) => `@i${i}`).join(', ');
  try {
    await runSql(`INSERT INTO ${safeId(table)} (${colList}) VALUES (${valList})`, params);
  } catch (err) {
    const col = String(err && err.message ? err.message : '').match(/Invalid column name '([^']+)'/i);
    if (col && Object.prototype.hasOwnProperty.call(filteredRow, col[1])) {
      const next = { ...filteredRow };
      delete next[col[1]];
      return sqlInsertRowSafe(table, next);
    }
    throw err;
  }
  return sqlSelectRowById(table, filteredRow.id);
}

async function sqlUpdateRowsSafe(table, data, filters) {
  const params = {};
  const entries = Object.entries(data || {}).filter(([, v]) => v !== undefined);
  entries.forEach(([k, v], i) => {
    params[`u${i}`] = { value: v };
  });
  const setClauses = entries.map(([k], i) => `${safeId(k)} = @u${i}`).join(', ');
  if (!setClauses) return [];
  const where = buildWhere(filters, params, 'w');
  const idRows = await runSql(`SELECT id FROM ${safeId(table)} ${where}`.trim(), params);
  if (!idRows || idRows.length === 0) return [];
  await runSql(`UPDATE ${safeId(table)} SET ${setClauses} ${where}`.trim(), params);
  const inParams = {};
  const placeholders = idRows.map((row, i) => {
    inParams[`rid${i}`] = { value: row.id };
    return `@rid${i}`;
  });
  return runSql(`SELECT * FROM ${safeId(table)} WHERE id IN (${placeholders.join(', ')})`, inParams);
}

async function sqlDeleteRowsSafe(table, filters) {
  const params = {};
  const where = buildWhere(filters, params, 'w');
  const snapshot = await runSql(`SELECT * FROM ${safeId(table)} ${where}`.trim(), params);
  await runSql(`DELETE FROM ${safeId(table)} ${where}`.trim(), params);
  return snapshot || [];
}

async function sqlUpsertRowSafe(table, clean) {
  const exists = await runSql(`SELECT TOP 1 id FROM ${safeId(table)} WHERE id = @id`, { id: { value: clean.id } });
  if (exists && exists.length > 0) {
    return (await sqlUpdateRowsSafe(table, clean, [{ col: 'id', op: 'eq', val: clean.id }]))[0] || null;
  }
  return sqlInsertRowSafe(table, clean);
}

function parseSqlRolePermissions(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'object' && !Buffer.isBuffer(raw)) return raw;
  const s = String(raw).trim();
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function signToken(userId) {
  const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL_SEC;
  const payload = `${userId}|${exp}`;
  const sig = crypto.createHmac('sha256', cfg.secret).update(payload).digest('hex');
  return Buffer.from(`${payload}|${sig}`).toString('base64url');
}

function verifyToken(header) {
  const raw = String(header || '').replace(/^Bearer\s+/i, '').trim();
  if (!raw) return null;
  let decoded;
  try {
    decoded = Buffer.from(raw, 'base64url').toString('utf8');
  } catch {
    return null;
  }
  const parts = decoded.split('|');
  if (parts.length !== 3) return null;
  const [userId, expStr, sig] = parts;
  const exp = Number(expStr);
  if (!userId || !Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return null;
  const expected = crypto.createHmac('sha256', cfg.secret).update(`${userId}|${expStr}`).digest('hex');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return { userId };
}

async function handleQuery(body) {
  try {
    const { table, operation, select, filters, orderBy, limitVal, data, countOnly, headOnly } = body || {};
    const safeTable = safeId(table);
    if (!safeTable) return { data: null, error: 'tablo gerekli' };

    if (operation === 'select') {
      if (countOnly) {
        const params = {};
        const where = buildWhere(filters, params, 'w');
        const rows = await runSql(`SELECT COUNT(*) AS cnt FROM ${safeTable} ${where}`.trim(), params);
        const cnt = rows && rows[0] ? Number(rows[0].cnt ?? rows[0].CNT ?? 0) : 0;
        return { data: headOnly ? null : [], count: cnt, error: null };
      }
      const hasJoin = select && /\w+\s*\(/.test(select);
      if (hasJoin) {
        const rows = await execSelectWithJoins(safeTable, select, filters, orderBy, limitVal);
        return { data: rows, error: null };
      }
      const params = {};
      const where = buildWhere(filters, params, 'w');
      const cols = mapSelectColumns(safeTable, select);
      const order = orderBy && orderBy.length > 0
        ? `ORDER BY ${orderBy.map((o) => `${safeId(o.col)} ${o.asc ? 'ASC' : 'DESC'}`).join(', ')}`
        : '';
      const top = limitVal ? `TOP ${parseInt(limitVal, 10)}` : '';
      const q = ['SELECT', top, cols, 'FROM', safeTable, where, order].filter(Boolean).join(' ').trim();
      const rows = await runSql(q, params);
      return { data: aliasSqlRows(safeTable, rows), error: null };
    }

    if (operation === 'insert') {
      const rowArr = Array.isArray(data) ? data : [data];
      const results = [];
      for (const row of rowArr) {
        const filteredRow = pickSqlRow(safeTable, row) || {};
        if (!filteredRow.id) filteredRow.id = crypto.randomUUID();
        const inserted = await sqlInsertRowSafe(safeTable, filteredRow);
        // PostgREST uyumu: insert her zaman dizi döner (.select() sonrası)
        results.push(inserted || filteredRow);
      }
      return { data: results, error: null };
    }

    if (operation === 'update') {
      const picked = pickSqlRow(safeTable, data) || {};
      const rows = await sqlUpdateRowsSafe(safeTable, picked, filters);
      return { data: rows || [], error: null };
    }

    if (operation === 'delete') {
      const rows = await sqlDeleteRowsSafe(safeTable, filters);
      return { data: rows || [], error: null };
    }

    if (operation === 'upsert') {
      const rowArr = Array.isArray(data) ? data : [data];
      const results = [];
      for (const row of rowArr) {
        const clean = pickSqlRow(safeTable, row) || {};
        if (safeTable === 'admin_tenant_impersonation' && clean.user_id) {
          clean.id = clean.user_id;
        }
        if (!clean.id) clean.id = crypto.randomUUID();
        const upserted = await sqlUpsertRowSafe(safeTable, clean);
        if (upserted) results.push(upserted);
      }
      return { data: rowArr.length === 1 ? results[0] || null : results, error: null };
    }

    return { data: null, error: 'Bilinmeyen operasyon: ' + operation };
  } catch (err) {
    console.error('[vds-api] query', (body && body.table) || '?', (body && body.operation) || '?', err && err.message ? err.message : err);
    return { data: null, error: (err && err.message) || String(err) };
  }
}

async function handleLogin(email, password) {
  const loginEmail = String(email || '').trim().toLowerCase();
  const rows = await runSql('EXEC sp_get_user_by_email @email', { email: { value: loginEmail } });
  const row = rows && rows[0];
  if (!row) return { success: false, error: 'Kullanici bulunamadi: ' + loginEmail };
  if (!row.password_hash) return { success: false, error: 'Sifre hash bulunamadi' };
  const passwordMatch = await bcrypt.compare(String(password), String(row.password_hash));
  if (!passwordMatch) return { success: false, error: 'Sifre hatali' };
  const userRecord = {
    user_id: row.user_id,
    email: row.email,
    profile_id: row.profile_id,
    tenant_id: row.tenant_id,
    branch_id: row.branch_id,
    role_id: row.role_id,
    full_name: row.full_name,
    role: row.role,
    is_super_admin: row.is_super_admin === true || row.is_super_admin === 1,
    onboarding_completed: row.onboarding_completed === true || row.onboarding_completed === 1,
    allowed_ips: row.allowed_ips,
    tenant_name: row.tenant_name,
    tenant_slug: row.tenant_slug,
    tenant_address: row.tenant_address || null,
    tenant_phone: row.tenant_phone || null,
    subscription_plan: row.subscription_plan || null,
    subscription_expires_at: row.subscription_expires_at || null,
    subscription_status: row.subscription_status || null,
    deployment_mode: row.deployment_mode,
    lock_pin: row.lock_pin,
    require_cancel_reason: row.require_cancel_reason === true || row.require_cancel_reason === 1,
    tenant_onboarding: row.tenant_onboarding === true || row.tenant_onboarding === 1,
    printer_settings: row.printer_settings,
    branch_name: row.branch_name,
    branch_is_main: row.branch_is_main === true || row.branch_is_main === 1,
    role_permissions: parseSqlRolePermissions(row.role_permissions) || DEFAULT_PERMISSIONS,
  };
  return { success: true, data: userRecord, token: signToken(String(row.user_id)) };
}

async function handleRegister(body) {
  const email = String(body?.email || '').trim().toLowerCase();
  const password = String(body?.password || '');
  const fullName = String(body?.fullName || body?.full_name || '').trim();
  const tenantName = String(body?.tenantName || body?.tenant_name || '').trim();
  const phoneRaw = String(body?.phone || '').replace(/\D/g, '');
  let phone = '';
  if (phoneRaw.length === 10 && phoneRaw.startsWith('5')) phone = '0' + phoneRaw;
  else if (phoneRaw.length === 11 && phoneRaw.startsWith('0')) phone = phoneRaw;
  else if (phoneRaw.length >= 10) phone = phoneRaw.slice(-11);

  if (!email || !email.includes('@')) return { success: false, error: 'Geçerli e-posta girin' };
  if (password.length < 6) return { success: false, error: 'Şifre en az 6 karakter olmalı' };
  if (!fullName) return { success: false, error: 'Ad soyad zorunlu' };
  if (!tenantName) return { success: false, error: 'Firma adı zorunlu' };

  const existing = await runSql('SELECT TOP 1 id FROM app_users WHERE email = @email', {
    email: { value: email },
  });
  if (existing && existing[0]) {
    return { success: false, error: 'Bu e-posta zaten kayıtlı' };
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const slug =
    tenantName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50) || 'isletme';

  await runSql(
    `EXEC sp_create_tenant_and_user @email, @password_hash, @full_name, @tenant_name, @tenant_slug`,
    {
      email: { value: email },
      password_hash: { value: passwordHash },
      full_name: { value: fullName },
      tenant_name: { value: tenantName },
      tenant_slug: { value: slug },
    },
  );

  // SP güncel değilse bile 3 günlük deneme garantile (Süresiz / professional fallback olmasın)
  try {
    await runSql(
      `UPDATE tenants SET
         subscription_status = N'trial',
         subscription_plan = N'trial',
         subscription_expires_at = COALESCE(subscription_expires_at, DATEADD(day, 3, GETUTCDATE()))
       WHERE id = (SELECT TOP 1 tenant_id FROM profiles WHERE email = @email)`,
      { email: { value: email } },
    );
  } catch (e) {
    console.error('[vds-api] register trial update:', e.message || e);
  }

  if (phone) {
    try {
      await runSql(`UPDATE profiles SET phone = @phone WHERE email = @email`, {
        phone: { value: phone },
        email: { value: email },
      });
    } catch (e) {
      console.error('[vds-api] register phone update:', e.message || e);
    }
  }

  return handleLogin(email, password);
}

function normalizePhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 11) return null;
  return digits.length === 10 ? '0' + digits : digits;
}

async function handleResolveLogin(input) {
  const trimmed = String(input || '').trim();
  if (!trimmed) return { ok: false, reason: 'invalid', message: 'Kullanıcı bilgisi girin' };
  if (trimmed.includes('@')) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      return { ok: false, reason: 'invalid', message: 'Geçersiz e-posta' };
    }
    return { ok: true, email: trimmed.toLowerCase(), kind: 'email' };
  }
  const phone = normalizePhone(trimmed);
  if (phone) {
    let rows = [];
    try {
      rows = await runSql(
        'SELECT TOP 2 email FROM profiles WHERE phone = @phone',
        { phone: { value: phone } },
      );
    } catch {
      rows = [];
    }
    if (rows.length === 1 && rows[0].email) {
      return { ok: true, email: String(rows[0].email), kind: 'phone' };
    }
    if (rows.length > 1) {
      return { ok: false, reason: 'ambiguous', message: 'Bu telefon birden fazla hesapla eşleşiyor; e-posta veya kullanıcı adıyla giriş yapın.' };
    }
    const digits = phone.replace(/^0/, '');
    return { ok: true, email: `m${digits}@sefpos.com.tr`, kind: 'phone' };
  }
  const u = trimmed.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (u.length < 2) return { ok: false, reason: 'invalid', message: 'Kullanıcı adı en az 2 karakter olmalı' };
  let rows = [];
  try {
    rows = await runSql(
      'SELECT TOP 2 email FROM profiles WHERE username = @u',
      { u: { value: u } },
    );
  } catch {
    rows = [];
  }
  if (rows.length === 1 && rows[0].email) return { ok: true, email: String(rows[0].email), kind: 'username' };
  if (rows.length > 1) {
    return { ok: false, reason: 'ambiguous', message: 'Bu kullanıcı adı birden fazla firmada var; tam e-posta adresinizi girin.' };
  }
  rows = await runSql(
    `SELECT TOP 2 email FROM profiles WHERE LOWER(email) LIKE @pat`,
    { pat: { value: `${u}@%.shefpos.local` } },
  );
  if (rows.length === 1 && rows[0].email) return { ok: true, email: String(rows[0].email), kind: 'username' };
  if (rows.length > 1) {
    return { ok: false, reason: 'ambiguous', message: 'Bu kullanıcı adı birden fazla firmada var; tam e-posta adresinizi girin.' };
  }
  return { ok: false, reason: 'not_found', message: 'Kullanıcı bulunamadı. Kullanıcı adını / telefonu / e-postayı kontrol edin.' };
}

async function handleRpc(fn, p) {
  p = p || {};
  if (fn === 'unlock_stale_payment_locks') {
    await runSql(
      `UPDATE restaurant_tables SET payment_locked = 0, payment_locked_at = NULL,
       payment_locked_by_session = NULL, payment_lock_expires_at = NULL
       WHERE payment_locked = 1 AND (
         (payment_lock_expires_at IS NOT NULL AND payment_lock_expires_at < GETUTCDATE())
         OR (payment_locked_at IS NOT NULL AND payment_locked_at < DATEADD(minute, -4, GETUTCDATE()))
         OR (payment_locked_at IS NULL AND payment_lock_expires_at IS NULL)
       )`,
      {},
    );
    return { data: null, error: null };
  }
  if (fn === 'unlock_table_payment') {
    const tableId = String(p.table_id || p.p_table_id || '');
    if (!tableId) return { data: { success: false, error: 'table_id zorunlu' }, error: null };
    await runSql(
      `UPDATE restaurant_tables SET payment_locked = 0, payment_locked_at = NULL,
       payment_locked_by_session = NULL, payment_lock_expires_at = NULL WHERE id = @id`,
      { id: { value: tableId } },
    );
    return { data: { success: true }, error: null };
  }
  if (fn === 'get_current_business_date') {
    const rows = await runSql(`SELECT CONVERT(varchar(10), CAST(GETDATE() AS date), 23) AS d`, {});
    const d = rows?.[0]?.d;
    return { data: d || new Date().toISOString().slice(0, 10), error: null };
  }
  if (fn === 'start_shift') {
    const branchId = String(p.p_branch_id || '');
    const tenantId = String(p.p_tenant_id || '');
    const openedBy = String(p.p_opened_by || '');
    if (!branchId || !tenantId) return { data: null, error: 'branch_id ve tenant_id zorunlu' };
    const bizRows = await runSql(`SELECT CONVERT(varchar(10), CAST(GETDATE() AS date), 23) AS d`, {});
    const businessDate = bizRows?.[0]?.d || new Date().toISOString().slice(0, 10);
    const existing = await runSql(
      `SELECT TOP 1 * FROM shifts WHERE tenant_id = @tid AND branch_id = @bid AND status = N'open' ORDER BY opened_at DESC`,
      { tid: { value: tenantId }, bid: { value: branchId } },
    );
    if (existing && existing[0]) return { data: existing[0], error: null };
    let shiftNo = Number(p.p_shift_no) || 1;
    let shiftName = `Vardiya ${shiftNo}`;
    let defId = p.p_shift_definition_id || null;
    if (defId) {
      const defs = await runSql(
        `SELECT TOP 1 id, shift_no, name FROM shift_definitions WHERE id = @id AND tenant_id = @tid`,
        { id: { value: defId }, tid: { value: tenantId } },
      );
      if (defs && defs[0]) {
        shiftNo = Number(defs[0].shift_no) || shiftNo;
        shiftName = defs[0].name || shiftName;
        defId = defs[0].id;
      }
    }
    const newId = crypto.randomUUID();
    const openingCash = Number(p.p_opening_cash) || 0;
    await runSql(
      `INSERT INTO shifts (id, tenant_id, branch_id, shift_definition_id, shift_no, shift_name, business_date,
        terminal_id, terminal_name, opened_by, opening_cash, opening_notes, status)
       VALUES (@id, @tid, @bid, @defid, @sno, @sname, @bdate, @termid, @tname, @oby, @ocash, @onotes, N'open')`,
      {
        id: { value: newId },
        tid: { value: tenantId },
        bid: { value: branchId },
        defid: { value: defId },
        sno: { value: shiftNo },
        sname: { value: shiftName },
        bdate: { value: businessDate },
        termid: { value: p.p_terminal_id || null },
        tname: { value: p.p_terminal_name || null },
        oby: { value: openedBy || null },
        ocash: { value: openingCash },
        onotes: { value: p.p_notes || null },
      },
    );
    return { data: await sqlSelectRowById('shifts', newId), error: null };
  }
  if (fn === 'close_shift') {
    const shiftId = String(p.p_shift_id || '');
    if (!shiftId) return { data: null, error: 'p_shift_id zorunlu' };
    const closingCash = Number(p.p_closing_cash) || 0;
    const closedBy = String(p.p_closed_by || '');
    const payRows = await runSql(
      `SELECT payment_method, SUM(amount) AS total FROM payment_transactions pt
       INNER JOIN orders o ON o.id = pt.order_id
       INNER JOIN shifts s ON s.id = @sid
       WHERE pt.created_at >= s.opened_at AND o.branch_id = s.branch_id
       GROUP BY payment_method`,
      { sid: { value: shiftId } },
    );
    let cashRev = 0;
    let cardRev = 0;
    let openRev = 0;
    for (const pr of payRows || []) {
      const m = String(pr.payment_method || '');
      const t = Number(pr.total) || 0;
      if (m === 'cash') cashRev += t;
      else if (m === 'credit_card') cardRev += t;
      else if (m === 'open_account') openRev += t;
    }
    const totalRev = cashRev + cardRev + openRev;
    await runSql(
      `UPDATE shifts SET status = N'closed', closed_at = GETUTCDATE(), closing_cash = @ccash,
        closed_by = @cby, cash_revenue = @cash, card_revenue = @card, open_account_revenue = @open,
        total_revenue = @tot, expected_cash = opening_cash + @cash, cash_difference = @ccash - (opening_cash + @cash),
        order_count = (SELECT COUNT(*) FROM orders o WHERE o.branch_id = shifts.branch_id AND o.created_at >= shifts.opened_at)
       WHERE id = @sid`,
      {
        sid: { value: shiftId },
        ccash: { value: closingCash },
        cby: { value: closedBy || null },
        cash: { value: cashRev },
        card: { value: cardRev },
        open: { value: openRev },
        tot: { value: totalRev },
      },
    );
    return { data: await sqlSelectRowById('shifts', shiftId), error: null };
  }
  if (fn === 'close_business_day') {
    const branchId = String(p.p_branch_id || '');
    const tenantId = String(p.p_tenant_id || '');
    const closedBy = String(p.p_closed_by || '');
    const biz =
      p.p_business_date ||
      (await runSql(`SELECT CONVERT(varchar(10), CAST(GETDATE() AS date), 23) AS d`, {}))?.[0]?.d;
    const openCnt = await runSql(
      `SELECT COUNT(*) AS cnt FROM shifts WHERE branch_id = @bid AND status = N'open'`,
      { bid: { value: branchId } },
    );
    if (openCnt && openCnt[0] && Number(openCnt[0].cnt) > 0) {
      return { data: null, error: 'Acik vardiya var; once vardiyalari kapatin' };
    }
    const newId = crypto.randomUUID();
    await runSql(
      `INSERT INTO daily_closures (id, tenant_id, branch_id, business_date, closed_by, notes, status)
       VALUES (@id, @tid, @bid, @bdate, @cby, @notes, N'closed')`,
      {
        id: { value: newId },
        tid: { value: tenantId },
        bid: { value: branchId },
        bdate: { value: biz },
        cby: { value: closedBy || null },
        notes: { value: p.p_notes || null },
      },
    );
    return { data: await sqlSelectRowById('daily_closures', newId), error: null };
  }
  return { data: null, error: `Bilinmeyen RPC: ${fn}` };
}

const { createVdsFunctions } = require('./vdsFunctions.cjs');
const { createVdsPartnerApi } = require('./vdsPartnerApi.cjs');
const vdsFns = createVdsFunctions({ runSql, cfg });
const vdsPartner = createVdsPartnerApi({ runSql, cfg });

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function corsHeaders(req) {
  const origin = String(req.headers.origin || '').trim();
  const allowed =
    !origin ||
    origin === 'https://sefpos.com.tr' ||
    origin === 'https://www.sefpos.com.tr' ||
    origin === 'http://localhost:5180' ||
    origin === 'http://127.0.0.1:5180' ||
    /^https:\/\/[a-z0-9.-]*sefpos\.com\.tr$/i.test(origin) ||
    /^https:\/\/[a-z0-9-]+\.pages\.dev$/i.test(origin);
  const headers = {
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
  if (allowed) {
    headers['Access-Control-Allow-Origin'] = origin || '*';
    if (origin) headers['Vary'] = 'Origin';
  }
  return headers;
}

/** Her istekte set edilir — sendJson CORS için */
let _corsReq = null;

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...(_corsReq ? corsHeaders(_corsReq) : {}),
  });
  res.end(body);
}

function routePath(url) {
  const u = String(url || '/').split('?')[0];
  return u.replace(/^\/vds-api/, '') || '/';
}

const server = http.createServer(async (req, res) => {
  _corsReq = req;
  const method = String(req.method || 'GET').toUpperCase();
  const p = routePath(req.url);
  if (method === 'OPTIONS') {
    res.writeHead(204, corsHeaders(req));
    return res.end();
  }
  try {
    if (method === 'GET' && (p === '/health' || p === '/')) {
      return sendJson(res, 200, { ok: true, db: cfg.database, vds: true });
    }
    if (method === 'POST' && p === '/login') {
      const body = await readBody(req);
      const result = await handleLogin(body.email, body.password);
      return sendJson(res, 200, result);
    }
    if (method === 'POST' && p === '/register') {
      const body = await readBody(req);
      try {
        const result = await handleRegister(body);
        return sendJson(res, 200, result);
      } catch (e) {
        return sendJson(res, 200, { success: false, error: e.message || 'Kayıt başarısız' });
      }
    }
    if (method === 'POST' && p === '/resolve-login') {
      const body = await readBody(req);
      const result = await handleResolveLogin(body.input);
      return sendJson(res, 200, result);
    }
    if (method === 'GET' && p === '/public-menu') {
      const u = new URL(req.url, 'http://127.0.0.1');
      try {
        const result = await vdsFns.handlePublicMenu(u.searchParams.get('branchId') || '');
        return sendJson(res, 200, result);
      } catch (e) {
        return sendJson(res, 200, { error: e.message || 'menu hata' });
      }
    }
    if (method === 'POST' && p === '/public-waiter-call') {
      const body = await readBody(req);
      try {
        const result = await vdsFns.handlePublicWaiterCall(body || {});
        return sendJson(res, 200, result);
      } catch (e) {
        return sendJson(res, 200, { error: e.message || 'cagri hata' });
      }
    }
    if (p === '/integrations/partner' || p.startsWith('/integrations/partner/')) {
      return vdsPartner.handle(req, res, p, method, sendJson, readBody);
    }
    if (method === 'POST' && p.startsWith('/fn/')) {
      const fnName = decodeURIComponent(p.slice(4).split('/')[0] || '');
      const body = await readBody(req);
      const auth = verifyToken(req.headers.authorization);
      if (!vdsFns.PUBLIC_FNS.has(fnName.toLowerCase()) && !auth) {
        return sendJson(res, 200, { success: false, error: 'Oturum gerekli' });
      }
      try {
        const result = await vdsFns.handleFn(fnName, body || {}, auth);
        return sendJson(res, 200, result);
      } catch (e) {
        return sendJson(res, 200, { success: false, error: e.message || String(e) });
      }
    }
    const auth = verifyToken(req.headers.authorization);
    if (!auth) return sendJson(res, 401, { data: null, error: 'Oturum gerekli' });
    if (method === 'POST' && p === '/query') {
      const body = await readBody(req);
      const result = await handleQuery(body);
      return sendJson(res, 200, result);
    }
    if (method === 'POST' && p === '/rpc') {
      const body = await readBody(req);
      const result = await handleRpc(body.fn, body.params);
      return sendJson(res, 200, result);
    }
    return sendJson(res, 404, { error: 'not found' });
  } catch (err) {
    console.error('[vds-api]', err);
    return sendJson(res, 500, { data: null, error: err.message || String(err) });
  }
});

process.on('uncaughtException', (err) => {
  console.error('[vds-api] uncaughtException:', err && err.stack ? err.stack : err);
});
process.on('unhandledRejection', (err) => {
  console.error('[vds-api] unhandledRejection:', err && err.stack ? err.stack : err);
});

pool.on('error', (err) => {
  console.error('[vds-api] pool error:', err && err.message ? err.message : err);
});

async function connectWithRetry() {
  const maxAttempts = Number(process.env.SEFPOS_VDS_SQL_RETRY || 30);
  let lastErr = null;
  for (let i = 1; i <= maxAttempts; i++) {
    try {
      await pool.connect();
      return;
    } catch (err) {
      lastErr = err;
      console.error(`[vds-api] SQL baglanti denemesi ${i}/${maxAttempts}:`, err.message || err);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw lastErr || new Error('SQL baglantisi kurulamadi');
}

connectWithRetry()
  .then(() => {
    const iisPort = process.env.PORT;
    if (iisPort) {
      server.listen(iisPort, () => {
        console.log(`[vds-api] iisnode/httpPlatform ${iisPort} → ${cfg.database}`);
      });
    } else {
      server.listen(LISTEN_PORT, LISTEN_HOST, () => {
        console.log(`[vds-api] ${LISTEN_HOST}:${LISTEN_PORT} → ${cfg.database}`);
      });
    }
  })
  .catch((err) => {
    console.error('[vds-api] SQL baglanti hatasi (kalici):', err.message);
    process.exit(1);
  });
