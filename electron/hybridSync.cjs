/**
 * Bulut ↔ SQL Server hibrit senkron (Electron main process).
 * Mobil garson / bulut siparişleri cloud tenant'ta kalır; kasa SQL'de çalışır, online olunca eşitlenir.
 */

const DEFAULT_SUPABASE_URL = 'https://xdfnozfuuzctubijbnds.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_wrSHY5Kzkw-bx0XzYM5VFA_FK3BFF_x';
/** Rutin sync dongusunde masa/grup dedupe en fazla bu aralikta bir calisir. */
const HYBRID_DEDUPE_MIN_MS = 30 * 60 * 1000;
let lastRoutineHybridDedupeAt = 0;

function supabaseBaseUrl() {
  return (process.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL).replace(/\/$/, '');
}

function supabaseAnonKey() {
  return process.env.VITE_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;
}

async function supabaseRest(path, accessToken, { method = 'GET', body } = {}) {
  const url = `${supabaseBaseUrl()}/rest/v1/${path}`;
  const prefer =
    method === 'POST'
      ? 'return=minimal,resolution=merge-duplicates'
      : method === 'PATCH'
        ? 'return=minimal'
        : 'return=representation';
  const headers = {
    apikey: supabaseAnonKey(),
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/json',
    Prefer: prefer,
  };
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Bulut API ${res.status}: ${text.slice(0, 200)}`);
  }
  if (res.status === 204) return [];
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('json')) return [];
  return res.json();
}

async function ensureHybridAccessToken(link, saveSettings) {
  if (!link?.accessToken) throw new Error('Bulut accessToken yok');
  const exp = Number(link.expiresAt || 0);
  if (exp && exp > Math.floor(Date.now() / 1000) + 90) {
    return link.accessToken;
  }
  if (!link.refreshToken) {
    return link.accessToken;
  }
  const url = `${supabaseBaseUrl()}/auth/v1/token?grant_type=refresh_token`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: supabaseAnonKey(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ refresh_token: link.refreshToken }),
  });
  if (!res.ok) {
    throw new Error('Bulut oturumu suresi doldu — Ayarlar → Hibrit → bulutu yeniden baglayin');
  }
  const auth = await res.json();
  const nextLink = {
    ...link,
    accessToken: auth.access_token,
    refreshToken: auth.refresh_token || link.refreshToken,
    expiresAt: auth.expires_at || null,
  };
  saveSettings({ hybridLink: nextLink });
  return auth.access_token;
}

async function cloudPasswordSignIn(email, password) {
  const url = `${supabaseBaseUrl()}/auth/v1/token?grant_type=password`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: supabaseAnonKey(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email: String(email || '').trim().toLowerCase(), password: String(password || '') }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    if (/invalid login credentials/i.test(text)) throw new Error('Bulut sifresi hatali');
    throw new Error(`Bulut girisi basarisiz (${res.status})`);
  }
  return res.json();
}

async function fetchCloudProfile(accessToken, userId) {
  const rows = await supabaseRest(
    `profiles?id=eq.${userId}&select=id,tenant_id,branch_id,full_name`,
    accessToken,
  );
  return rows?.[0] || null;
}

function colType(TYPES, col, val) {
  if (val === null || val === undefined) return TYPES.NVarChar;
  if (typeof val === 'boolean') return TYPES.Bit || TYPES.NVarChar;
  if (typeof val === 'number' && Number.isInteger(val)) return TYPES.Int;
  if (col === 'id' || col.endsWith('_id')) return TYPES.UniqueIdentifier;
  return TYPES.NVarChar;
}

/** Katalog aktarimi: masa yerlesim bilgisi; canli oturum/siparis SQL'de sifirlanir. */
function sanitizeRestaurantTableForCatalogImport(row, sqlTenantId, sqlBranchId) {
  const status = String(row?.status || '').toLowerCase();
  const normalizedStatus =
    status === 'occupied' || status === 'busy' || status === 'reserved' ? 'available' : (status || 'available');
  return {
    ...row,
    tenant_id: sqlTenantId,
    branch_id: sqlBranchId,
    status: normalizedStatus === 'available' || normalizedStatus === 'reserved' ? normalizedStatus : 'available',
    current_order_id: null,
    session_start: null,
    payment_locked: false,
    payment_locked_at: null,
    payment_locked_by_session: null,
    payment_lock_expires_at: null,
  };
}

async function upsertSqlRow(runSql, TYPES, cfg, dbName, table, row, pickSqlRow) {
  const filtered = pickSqlRow ? pickSqlRow(table, row) || {} : row;
  const id = filtered.id;
  if (!id) return;
  const existing = await runSql(
    `SELECT TOP 1 id FROM [${table}] WHERE id = @id`,
    { id: { type: TYPES.UniqueIdentifier, value: id } },
    cfg,
    dbName,
  );
  const cols = Object.keys(filtered).filter((k) => filtered[k] !== undefined);
  const params = {};
  cols.forEach((c) => {
    params[c] = { type: colType(TYPES, c, filtered[c]), value: filtered[c] ?? null };
  });
  if (existing?.[0]?.id) {
    const sets = cols.filter((c) => c !== 'id').map((c) => `[${c}] = @${c}`).join(', ');
    if (sets) {
      await runSql(`UPDATE [${table}] SET ${sets} WHERE id = @id`, params, cfg, dbName);
    }
  } else {
    const colList = cols.map((c) => `[${c}]`).join(', ');
    const vals = cols.map((c) => `@${c}`).join(', ');
    await runSql(`INSERT INTO [${table}] (${colList}) VALUES (${vals})`, params, cfg, dbName);
  }
}

async function findLocalTableByNumber(runSql, TYPES, cfg, dbName, tenantId, branchId, tableNumber) {
  const rows = await runSql(
    `SELECT TOP 1 id FROM restaurant_tables
     WHERE tenant_id = @tenant AND branch_id = @branch AND table_number = @num`,
    {
      tenant: { type: TYPES.UniqueIdentifier, value: tenantId },
      branch: { type: TYPES.UniqueIdentifier, value: branchId },
      num: { type: TYPES.NVarChar, value: String(tableNumber) },
    },
    cfg,
    dbName,
  ).catch(() => []);
  return rows?.[0]?.id || null;
}

async function findLocalGroupByName(runSql, TYPES, cfg, dbName, tenantId, name) {
  if (!name) return null;
  const rows = await runSql(
    `SELECT TOP 1 id FROM table_groups
     WHERE tenant_id = @tenant
       AND LOWER(LTRIM(RTRIM(name))) = LOWER(LTRIM(RTRIM(@name)))`,
    {
      tenant: { type: TYPES.UniqueIdentifier, value: tenantId },
      name: { type: TYPES.NVarChar, value: String(name) },
    },
    cfg,
    dbName,
  ).catch(() => []);
  return rows?.[0]?.id || null;
}

/** Yerel masa kaydini bulut id ile birlestir; siparis FK'leri korunur. */
async function mergeRestaurantTableToCloudId(runSql, TYPES, cfg, dbName, localId, cloudRow, pickSqlRow) {
  const cloudId = cloudRow.id;
  if (!localId || !cloudId || localId === cloudId) {
    await upsertSqlRow(runSql, TYPES, cfg, dbName, 'restaurant_tables', cloudRow, pickSqlRow);
    return cloudId;
  }
  await runSql(
    `UPDATE orders SET table_id = @cloudId WHERE table_id = @localId`,
    {
      cloudId: { type: TYPES.UniqueIdentifier, value: cloudId },
      localId: { type: TYPES.UniqueIdentifier, value: localId },
    },
    cfg,
    dbName,
  ).catch(() => {});
  await runSql(
    `UPDATE restaurant_tables SET current_order_id = NULL WHERE id = @localId`,
    { localId: { type: TYPES.UniqueIdentifier, value: localId } },
    cfg,
    dbName,
  ).catch(() => {});
  await runSql(
    `DELETE FROM restaurant_tables WHERE id = @localId`,
    { localId: { type: TYPES.UniqueIdentifier, value: localId } },
    cfg,
    dbName,
  ).catch(() => {});
  await upsertSqlRow(runSql, TYPES, cfg, dbName, 'restaurant_tables', cloudRow, pickSqlRow);
  return cloudId;
}

async function dedupeRestaurantTablesByNumber(runSql, TYPES, cfg, dbName, tenantId, branchId, pickSqlRow) {
  const dupNumbers = await runSql(
    `SELECT table_number
     FROM restaurant_tables
     WHERE tenant_id = @tenant AND branch_id = @branch
     GROUP BY table_number
     HAVING COUNT(*) > 1`,
    {
      tenant: { type: TYPES.UniqueIdentifier, value: tenantId },
      branch: { type: TYPES.UniqueIdentifier, value: branchId },
    },
    cfg,
    dbName,
  ).catch(() => []);
  let removed = 0;
  for (const dup of dupNumbers || []) {
    const rows = await runSql(
      `SELECT id, created_at FROM restaurant_tables
       WHERE tenant_id = @tenant AND branch_id = @branch AND table_number = @num
       ORDER BY created_at DESC`,
      {
        tenant: { type: TYPES.UniqueIdentifier, value: tenantId },
        branch: { type: TYPES.UniqueIdentifier, value: branchId },
        num: { type: TYPES.NVarChar, value: String(dup.table_number) },
      },
      cfg,
      dbName,
    ).catch(() => []);
    if (!rows || rows.length < 2) continue;
    const keepId = rows[0].id;
    for (let i = 1; i < rows.length; i++) {
      const dropId = rows[i].id;
      await runSql(
        `UPDATE orders SET table_id = @keep WHERE table_id = @drop`,
        {
          keep: { type: TYPES.UniqueIdentifier, value: keepId },
          drop: { type: TYPES.UniqueIdentifier, value: dropId },
        },
        cfg,
        dbName,
      ).catch(() => {});
      await runSql(
        `UPDATE restaurant_tables SET current_order_id = NULL WHERE id = @drop`,
        { drop: { type: TYPES.UniqueIdentifier, value: dropId } },
        cfg,
        dbName,
      ).catch(() => {});
      await runSql(
        `DELETE FROM restaurant_tables WHERE id = @drop`,
        { drop: { type: TYPES.UniqueIdentifier, value: dropId } },
        cfg,
        dbName,
      ).catch(() => {});
      removed++;
    }
  }
  return removed;
}

async function dedupeTableGroupsByName(runSql, TYPES, cfg, dbName, tenantId, branchId) {
  const rows = await runSql(
    `SELECT id, name,
       (SELECT COUNT(*) FROM restaurant_tables rt
        WHERE rt.group_id = table_groups.id AND rt.tenant_id = @tenant
          AND rt.branch_id = @branch) AS table_count
     FROM table_groups
     WHERE tenant_id = @tenant
       AND (branch_id = @branch OR branch_id IS NULL)`,
    {
      tenant: { type: TYPES.UniqueIdentifier, value: tenantId },
      branch: { type: TYPES.UniqueIdentifier, value: branchId },
    },
    cfg,
    dbName,
  ).catch(() => []);
  const byNorm = new Map();
  let removed = 0;
  for (const row of rows || []) {
    const norm = String(row.name || '').trim().toLowerCase();
    if (!norm) continue;
    const existing = byNorm.get(norm);
    if (!existing) {
      byNorm.set(norm, row);
      continue;
    }
    const keep = Number(row.table_count || 0) >= Number(existing.table_count || 0) ? row : existing;
    const drop = keep.id === row.id ? existing : row;
    await runSql(
      `UPDATE restaurant_tables SET group_id = @keep WHERE group_id = @drop AND tenant_id = @tenant`,
      {
        keep: { type: TYPES.UniqueIdentifier, value: keep.id },
        drop: { type: TYPES.UniqueIdentifier, value: drop.id },
        tenant: { type: TYPES.UniqueIdentifier, value: tenantId },
      },
      cfg,
      dbName,
    ).catch(() => {});
    await runSql(
      `DELETE FROM table_groups WHERE id = @drop AND tenant_id = @tenant`,
      {
        drop: { type: TYPES.UniqueIdentifier, value: drop.id },
        tenant: { type: TYPES.UniqueIdentifier, value: tenantId },
      },
      cfg,
      dbName,
    ).catch(() => {});
    byNorm.set(norm, keep);
    removed++;
  }
  return removed;
}

async function resolveSqlTableIdForCloudOrder(runSql, TYPES, cfg, dbName, link, cloudTableId, accessToken) {
  if (!cloudTableId) return null;
  const { sqlTenantId, sqlBranchId } = link;
  const byId = await runSql(
    `SELECT TOP 1 id FROM restaurant_tables WHERE id = @id`,
    { id: { type: TYPES.UniqueIdentifier, value: cloudTableId } },
    cfg,
    dbName,
  ).catch(() => []);
  if (byId?.[0]?.id) return cloudTableId;

  let tableNumber = null;
  try {
    const cloudRows = await supabaseRest(
      `restaurant_tables?id=eq.${cloudTableId}&select=table_number`,
      accessToken,
    );
    tableNumber = cloudRows?.[0]?.table_number;
  } catch {
    /* ignore */
  }
  if (tableNumber == null) return cloudTableId;
  const localId = await findLocalTableByNumber(runSql, TYPES, cfg, dbName, sqlTenantId, sqlBranchId, tableNumber);
  return localId || cloudTableId;
}

async function resolveCloudBranchId(link, sqlBranchId, runSql, TYPES, cfg, dbName, accessToken, cache) {
  if (!sqlBranchId || sqlBranchId === link.sqlBranchId) return link.cloudBranchId;
  const key = String(sqlBranchId);
  if (cache.has(key)) return cache.get(key);
  const rows = await runSql(
    `SELECT TOP 1 name FROM branches WHERE id = @id`,
    { id: { type: TYPES.UniqueIdentifier, value: sqlBranchId } },
    cfg,
    dbName,
  ).catch(() => []);
  const name = rows?.[0]?.name;
  if (!name) {
    cache.set(key, link.cloudBranchId);
    return link.cloudBranchId;
  }
  const encoded = encodeURIComponent(String(name));
  const cloudRows = await supabaseRest(
    `branches?tenant_id=eq.${link.cloudTenantId}&name=eq.${encoded}&select=id`,
    accessToken,
  ).catch(() => []);
  const cloudId = cloudRows?.[0]?.id || link.cloudBranchId;
  cache.set(key, cloudId);
  return cloudId;
}

async function resolveCloudTableIdFromSql(runSql, TYPES, cfg, dbName, link, sqlTableId, cloudBranchId, accessToken) {
  if (!sqlTableId) return null;
  try {
    const byId = await supabaseRest(
      `restaurant_tables?id=eq.${sqlTableId}&select=id`,
      accessToken,
    );
    if (byId?.[0]?.id) return sqlTableId;
  } catch {
    /* ignore */
  }
  const sqlRows = await runSql(
    `SELECT TOP 1 table_number FROM restaurant_tables WHERE id = @id`,
    { id: { type: TYPES.UniqueIdentifier, value: sqlTableId } },
    cfg,
    dbName,
  ).catch(() => []);
  const num = sqlRows?.[0]?.table_number;
  if (num == null) return sqlTableId;
  const numEnc = encodeURIComponent(String(num));
  const cloudRows = await supabaseRest(
    `restaurant_tables?tenant_id=eq.${link.cloudTenantId}&branch_id=eq.${cloudBranchId}&table_number=eq.${numEnc}&select=id`,
    accessToken,
  ).catch(() => []);
  return cloudRows?.[0]?.id || sqlTableId;
}

function sanitizeOrderForCloudPush(order, cloudTenantId, cloudBranchId, cloudTableId) {
  const payload = { ...order };
  payload.tenant_id = cloudTenantId;
  payload.branch_id = cloudBranchId;
  if (cloudTableId) payload.table_id = cloudTableId;
  else if (!payload.table_id) payload.table_id = null;
  if (String(payload.status || '').toLowerCase() === 'open') payload.status = 'active';
  payload.updated_at = order.updated_at || new Date().toISOString();
  delete payload.row_version;
  return payload;
}

function tsMs(val) {
  if (!val) return 0;
  const t = Date.parse(val);
  return Number.isFinite(t) ? t : 0;
}

function isNewer(a, b) {
  return tsMs(a) > tsMs(b);
}

async function fetchCloudOrderMeta(orderId, accessToken) {
  if (!orderId) return null;
  const rows = await supabaseRest(
    `orders?id=eq.${orderId}&select=id,updated_at,status`,
    accessToken,
  ).catch(() => []);
  return rows?.[0] || null;
}

async function fetchLocalOrderMeta(runSql, TYPES, cfg, dbName, orderId) {
  if (!orderId) return null;
  const rows = await runSql(
    `SELECT TOP 1 id, updated_at, status FROM orders WHERE id = @id`,
    { id: { type: TYPES.UniqueIdentifier, value: orderId } },
    cfg,
    dbName,
  ).catch(() => []);
  return rows?.[0] || null;
}

function tableActivityMs(status, sessionStart, orderUpdatedAt) {
  const base = Math.max(tsMs(sessionStart), tsMs(orderUpdatedAt));
  if (base > 0) return base;
  return String(status || '').toLowerCase() === 'occupied' ? 1 : 0;
}

async function pushSingleOrder(order, ctx) {
  const { link, accessToken, runSql, TYPES, cfg, dbName, branchCache } = ctx;
  const { cloudTenantId } = link;
  const cloudBranchId = await resolveCloudBranchId(
    link,
    order.branch_id,
    runSql,
    TYPES,
    cfg,
    dbName,
    accessToken,
    branchCache,
  );
  const cloudTableId = order.table_id
    ? await resolveCloudTableIdFromSql(
        runSql,
        TYPES,
        cfg,
        dbName,
        link,
        order.table_id,
        cloudBranchId,
        accessToken,
      )
    : null;
  const payload = sanitizeOrderForCloudPush(order, cloudTenantId, cloudBranchId, cloudTableId);
  await supabaseRest('orders?on_conflict=id', accessToken, { method: 'POST', body: payload });
  const items = await runSql(
    `SELECT * FROM order_items WHERE order_id = @oid`,
    { oid: { type: TYPES.UniqueIdentifier, value: order.id } },
    cfg,
    dbName,
  );
  for (const item of items || []) {
    const itemPayload = { ...item, tenant_id: cloudTenantId };
    delete itemPayload.row_version;
    await supabaseRest('order_items?on_conflict=id', accessToken, { method: 'POST', body: itemPayload });
  }
}

async function pullSingleOrder(order, ctx) {
  const { link, accessToken, runSql, TYPES, cfg, dbName, pickSqlRow } = ctx;
  const { sqlTenantId, sqlBranchId } = link;
  const items = await supabaseRest(
    `order_items?order_id=eq.${order.id}&select=*`,
    accessToken,
  );
  const sqlTableId = order.table_id
    ? await resolveSqlTableIdForCloudOrder(runSql, TYPES, cfg, dbName, link, order.table_id, accessToken)
    : null;
  await upsertSqlRow(runSql, TYPES, cfg, dbName, 'orders', {
    ...order,
    tenant_id: sqlTenantId,
    branch_id: sqlBranchId,
    table_id: sqlTableId || order.table_id,
  }, pickSqlRow);
  for (const item of items || []) {
    await upsertSqlRow(runSql, TYPES, cfg, dbName, 'order_items', {
      ...item,
      tenant_id: sqlTenantId,
    }, pickSqlRow);
  }
}

async function applyLocalTableFromCloud(localTableId, cloudRow, ctx) {
  const { link, runSql, TYPES, cfg, dbName } = ctx;
  const { sqlTenantId } = link;
  const status = String(cloudRow.status || 'available').toLowerCase();
  const occupied = status === 'occupied' || status === 'busy';
  let orderId = cloudRow.current_order_id || null;
  if (orderId) {
    const localOrder = await fetchLocalOrderMeta(runSql, TYPES, cfg, dbName, orderId);
    if (!localOrder) orderId = null;
  }
  await runSql(
    `UPDATE restaurant_tables SET
       status = @status,
       current_order_id = @oid,
       session_start = @sess,
       payment_locked = @plock
     WHERE id = @tid AND tenant_id = @tenant`,
    {
      status: { type: TYPES.NVarChar, value: occupied && orderId ? 'occupied' : 'available' },
      oid: { type: TYPES.UniqueIdentifier, value: occupied && orderId ? orderId : null },
      sess: { type: TYPES.DateTime2, value: occupied ? (cloudRow.session_start || new Date().toISOString()) : null },
      plock: { type: TYPES.Bit, value: occupied ? !!cloudRow.payment_locked : false },
      tid: { type: TYPES.UniqueIdentifier, value: localTableId },
      tenant: { type: TYPES.UniqueIdentifier, value: sqlTenantId },
    },
    cfg,
    dbName,
  );
}

async function applyCloudTableFromLocal(cloudTableId, localRow, ctx) {
  const { accessToken } = ctx;
  const occupied = String(localRow.status || '').toLowerCase() === 'occupied' && localRow.current_order_id;
  if (occupied) {
    await supabaseRest(`restaurant_tables?id=eq.${cloudTableId}`, accessToken, {
      method: 'PATCH',
      body: {
        status: 'occupied',
        current_order_id: localRow.current_order_id,
        session_start: localRow.session_start || new Date().toISOString(),
        payment_locked: !!localRow.payment_locked,
      },
    });
  } else {
    await supabaseRest(`restaurant_tables?id=eq.${cloudTableId}`, accessToken, {
      method: 'PATCH',
      body: {
        status: 'available',
        current_order_id: null,
        session_start: null,
        payment_locked: false,
      },
    });
  }
}

async function importCatalogFromCloud({ link, accessToken, runSql, getSqlParamTypes, cfg, dbName, pickSqlRow }) {
  const TYPES = getSqlParamTypes();
  const { cloudTenantId, cloudBranchId, sqlTenantId, sqlBranchId } = link;
  let imported = 0;

  const categories = await supabaseRest(
    `categories?tenant_id=eq.${cloudTenantId}&select=*`,
    accessToken,
  );
  for (const row of categories || []) {
    await upsertSqlRow(runSql, TYPES, cfg, dbName, 'categories', {
      ...row,
      tenant_id: sqlTenantId,
    }, pickSqlRow);
    imported++;
  }

  const products = await supabaseRest(
    `products?tenant_id=eq.${cloudTenantId}&select=*&order=created_at.asc`,
    accessToken,
  );
  for (const row of products || []) {
    await upsertSqlRow(runSql, TYPES, cfg, dbName, 'products', {
      ...row,
      tenant_id: sqlTenantId,
    }, pickSqlRow);
    imported++;
  }

  const groups = await supabaseRest(
    `table_groups?tenant_id=eq.${cloudTenantId}&select=*`,
    accessToken,
  );
  const groupIdMap = new Map();
  for (const row of groups || []) {
    const localGroupId = await findLocalGroupByName(runSql, TYPES, cfg, dbName, sqlTenantId, row.name);
    const targetGroupId = localGroupId && localGroupId !== row.id ? localGroupId : row.id;
    groupIdMap.set(row.id, targetGroupId);
    const groupRow = {
      ...row,
      id: targetGroupId,
      tenant_id: sqlTenantId,
      branch_id: row.branch_id ? sqlBranchId : null,
    };
    if (localGroupId && localGroupId !== row.id) {
      await upsertSqlRow(runSql, TYPES, cfg, dbName, 'table_groups', groupRow, pickSqlRow);
      await runSql(
        `UPDATE restaurant_tables SET group_id = @target WHERE group_id = @old AND tenant_id = @tenant`,
        {
          target: { type: TYPES.UniqueIdentifier, value: targetGroupId },
          old: { type: TYPES.UniqueIdentifier, value: row.id },
          tenant: { type: TYPES.UniqueIdentifier, value: sqlTenantId },
        },
        cfg,
        dbName,
      ).catch(() => {});
      await runSql(
        `DELETE FROM table_groups WHERE id = @old AND tenant_id = @tenant`,
        {
          old: { type: TYPES.UniqueIdentifier, value: row.id },
          tenant: { type: TYPES.UniqueIdentifier, value: sqlTenantId },
        },
        cfg,
        dbName,
      ).catch(() => {});
    } else {
      await upsertSqlRow(runSql, TYPES, cfg, dbName, 'table_groups', groupRow, pickSqlRow);
    }
    imported++;
  }

  const tables = await supabaseRest(
    `restaurant_tables?tenant_id=eq.${cloudTenantId}&branch_id=eq.${cloudBranchId}&select=*`,
    accessToken,
  );
  for (const row of tables || []) {
    const mappedGroupId = row.group_id ? (groupIdMap.get(row.group_id) || row.group_id) : null;
    const cloudRow = sanitizeRestaurantTableForCatalogImport(row, sqlTenantId, sqlBranchId);
    if (mappedGroupId) cloudRow.group_id = mappedGroupId;
    const localId = await findLocalTableByNumber(
      runSql,
      TYPES,
      cfg,
      dbName,
      sqlTenantId,
      sqlBranchId,
      row.table_number,
    );
    if (localId && localId !== cloudRow.id) {
      await mergeRestaurantTableToCloudId(runSql, TYPES, cfg, dbName, localId, cloudRow, pickSqlRow);
    } else {
      await upsertSqlRow(runSql, TYPES, cfg, dbName, 'restaurant_tables', cloudRow, pickSqlRow);
    }
    imported++;
  }

  await dedupeRestaurantTablesByNumber(runSql, TYPES, cfg, dbName, sqlTenantId, sqlBranchId, pickSqlRow);
  await dedupeTableGroupsByName(runSql, TYPES, cfg, dbName, sqlTenantId, sqlBranchId);

  return { imported, categories: (categories || []).length, products: (products || []).length, tables: (tables || []).length };
}

async function syncOrdersBidirectional(ctx) {
  const { link, accessToken, runSql, getSqlParamTypes, cfg, dbName, sinceIso } = ctx;
  const TYPES = getSqlParamTypes();
  const { cloudTenantId, cloudBranchId, sqlTenantId } = link;
  let pushed = 0;
  let pulled = 0;
  const errors = [];
  const since = sinceIso || new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();

  const localRows = await runSql(
    `SELECT o.* FROM orders o
     WHERE o.tenant_id = @tenant
       AND o.updated_at >= DATEADD(hour, -72, GETUTCDATE())
     ORDER BY o.updated_at DESC`,
    { tenant: { type: TYPES.UniqueIdentifier, value: sqlTenantId } },
    cfg,
    dbName,
  ).catch(() => []);

  const cloudRows = await supabaseRest(
    `orders?tenant_id=eq.${cloudTenantId}&branch_id=eq.${cloudBranchId}&updated_at=gte.${since}&select=*&order=updated_at.asc`,
    accessToken,
  ).catch(() => []);

  const byId = new Map();
  for (const row of localRows || []) byId.set(String(row.id), { local: row });
  for (const row of cloudRows || []) {
    const key = String(row.id);
    const entry = byId.get(key) || {};
    entry.cloud = row;
    byId.set(key, entry);
  }

  for (const { local, cloud } of byId.values()) {
    try {
      if (local && cloud) {
        if (isNewer(local.updated_at, cloud.updated_at)) {
          await pushSingleOrder(local, ctx);
          pushed++;
        } else if (isNewer(cloud.updated_at, local.updated_at)) {
          await pullSingleOrder(cloud, ctx);
          pulled++;
        }
      } else if (local) {
        await pushSingleOrder(local, ctx);
        pushed++;
      } else if (cloud) {
        await pullSingleOrder(cloud, ctx);
        pulled++;
      }
    } catch (err) {
      errors.push((err.message || String(err)).slice(0, 120));
    }
  }
  return { pushed, pulled, errors };
}

async function syncTableStatesBidirectional(ctx) {
  const { link, accessToken, runSql, getSqlParamTypes, cfg, dbName, branchCache } = ctx;
  const TYPES = getSqlParamTypes();
  const { sqlTenantId, sqlBranchId, cloudTenantId, cloudBranchId } = link;
  let synced = 0;
  const errors = [];

  const localRows = await runSql(
    `SELECT rt.id, rt.branch_id, rt.status, rt.current_order_id, rt.session_start, rt.payment_locked, rt.table_number
     FROM restaurant_tables rt
     WHERE rt.tenant_id = @tenant AND rt.branch_id = @branch`,
    {
      tenant: { type: TYPES.UniqueIdentifier, value: sqlTenantId },
      branch: { type: TYPES.UniqueIdentifier, value: sqlBranchId },
    },
    cfg,
    dbName,
  ).catch(() => []);

  const cloudRows = await supabaseRest(
    `restaurant_tables?tenant_id=eq.${cloudTenantId}&branch_id=eq.${cloudBranchId}&select=id,status,current_order_id,session_start,payment_locked,table_number`,
    accessToken,
  ).catch(() => []);

  const cloudByNum = new Map();
  for (const row of cloudRows || []) cloudByNum.set(String(row.table_number), row);

  for (const local of localRows || []) {
    try {
      const cloudRow = cloudByNum.get(String(local.table_number));
      const cloudTableId = cloudRow?.id || (await resolveCloudTableIdFromSql(
        runSql,
        TYPES,
        cfg,
        dbName,
        link,
        local.id,
        cloudBranchId,
        accessToken,
      ));
      if (!cloudTableId) continue;

      const localOrderTs = local.current_order_id
        ? (await fetchLocalOrderMeta(runSql, TYPES, cfg, dbName, local.current_order_id))?.updated_at
        : null;
      const cloudOrderTs = cloudRow?.current_order_id
        ? (await fetchCloudOrderMeta(cloudRow.current_order_id, accessToken))?.updated_at
        : null;
      const localVer = tableActivityMs(local.status, local.session_start, localOrderTs);
      const cloudVer = tableActivityMs(cloudRow?.status, cloudRow?.session_start, cloudOrderTs);

      if (localVer > cloudVer) {
        await applyCloudTableFromLocal(cloudTableId, local, ctx);
        synced++;
      } else if (cloudVer > localVer && cloudRow) {
        await applyLocalTableFromCloud(local.id, cloudRow, ctx);
        synced++;
      }
    } catch (err) {
      errors.push((err.message || String(err)).slice(0, 120));
    }
  }
  return { synced, errors };
}

/** @deprecated use syncOrdersBidirectional */
async function pullCloudOrders(ctx) {
  const r = await syncOrdersBidirectional(ctx);
  return { pulled: r.pulled };
}

/** @deprecated use syncOrdersBidirectional */
async function pushLocalOrders(ctx) {
  const r = await syncOrdersBidirectional(ctx);
  return { pushed: r.pushed, errors: r.errors };
}

async function pullWaiterCalls({ link, accessToken, runSql, getSqlParamTypes, cfg, dbName, sinceIso, pickSqlRow }) {
  const TYPES = getSqlParamTypes();
  const { cloudTenantId, cloudBranchId, sqlTenantId, sqlBranchId } = link;
  const since = sinceIso || new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  let pulled = 0;
  try {
    const calls = await supabaseRest(
      `waiter_calls?tenant_id=eq.${cloudTenantId}&branch_id=eq.${cloudBranchId}&created_at=gte.${since}&select=*`,
      accessToken,
    );
    for (const row of calls || []) {
      await upsertSqlRow(runSql, TYPES, cfg, dbName, 'waiter_calls', {
        ...row,
        tenant_id: sqlTenantId,
        branch_id: sqlBranchId,
      }, pickSqlRow);
      pulled++;
    }
  } catch {
    /* waiter_calls tablosu yoksa atla */
  }
  return { pulled };
}

async function doHybridSyncCycle(deps) {
  const { loadSettings, saveSettings, runSql, getSqlParamTypes, pickSqlRow } = deps;
  const settings = loadSettings();
  const link = settings.hybridLink;
  const accessToken = link?.accessToken;
  if (!link?.cloudTenantId || !link?.sqlTenantId || !accessToken) {
    return { success: false, error: 'Bulut bağlantısı kurulmamış' };
  }
  const cfg = settings.sqlServerConfig;
  if (!cfg) return { success: false, error: 'SQL Server yapılandırması yok' };
  const dbName = cfg.database || 'sefpos45';
  const sinceIso = link.lastSyncAt || null;

  const freshToken = await ensureHybridAccessToken(link, saveSettings);
  const branchCache = new Map();
  const TYPES = getSqlParamTypes();
  const dedupeNow = Date.now();
  if (!lastRoutineHybridDedupeAt || dedupeNow - lastRoutineHybridDedupeAt >= HYBRID_DEDUPE_MIN_MS) {
    await dedupeRestaurantTablesByNumber(
      runSql,
      TYPES,
      cfg,
      dbName,
      link.sqlTenantId,
      link.sqlBranchId,
      pickSqlRow,
    );
    await dedupeTableGroupsByName(
      runSql,
      TYPES,
      cfg,
      dbName,
      link.sqlTenantId,
      link.sqlBranchId,
    );
    lastRoutineHybridDedupeAt = dedupeNow;
  }

  const ctx = {
    link,
    accessToken: freshToken,
    runSql,
    getSqlParamTypes,
    TYPES,
    cfg,
    dbName,
    branchCache,
    sinceIso,
    pickSqlRow,
  };

  const orders = await syncOrdersBidirectional(ctx);
  const tables = await syncTableStatesBidirectional(ctx);
  const calls = await pullWaiterCalls({
    link,
    accessToken: freshToken,
    runSql,
    getSqlParamTypes,
    cfg,
    dbName,
    sinceIso,
    pickSqlRow,
  });
  const now = new Date().toISOString();
  const syncError = [...orders.errors, ...tables.errors][0] || null;
  saveSettings({
    hybridLink: { ...link, lastSyncAt: now, lastSyncError: syncError },
  });
  return {
    success: true,
    pushedOrders: orders.pushed,
    pulledOrders: orders.pulled,
    pushedTables: tables.synced,
    pulledCalls: calls.pulled,
    pushedOrdersErrors: orders.errors.length,
    lastSyncAt: now,
    warning: syncError,
    hadChanges:
      (orders.pushed || 0) +
        (orders.pulled || 0) +
        (tables.synced || 0) +
        (calls.pulled || 0) >
      0,
  };
}

let hybridSyncInFlight = null;
let hybridSyncQueued = false;

async function runHybridSyncNow(deps) {
  if (hybridSyncInFlight) {
    hybridSyncQueued = true;
    return hybridSyncInFlight;
  }
  const run = async () => {
    const { loadSettings, saveSettings } = deps;
    const link = loadSettings().hybridLink;
    try {
      return await doHybridSyncCycle(deps);
    } catch (err) {
      saveSettings({
        hybridLink: { ...link, lastSyncError: (err.message || '').slice(0, 300) },
      });
      return { success: false, error: err.message || 'Senkron hatası' };
    } finally {
      if (hybridSyncQueued) {
        hybridSyncQueued = false;
        return run();
      }
    }
  };
  hybridSyncInFlight = run().finally(() => {
    hybridSyncInFlight = null;
  });
  return hybridSyncInFlight;
}

function registerHybridSyncIpc(deps) {
  const {
    ipcMain,
    loadSettings,
    saveSettings,
    runSql,
    getSqlParamTypes,
    writeSecureJson,
    settingsSecurePath,
    pickSqlRow,
    applySqlSchemaPatches,
    normalizeSqlServerConfig,
    ensureDefaultAdminUser,
  } = deps;

  ipcMain.handle('get-hybrid-link', () => {
    const link = loadSettings().hybridLink || null;
    if (!link?.cloudTenantId) return { success: true, link: null };
    return {
      success: true,
      link: {
        cloudTenantId: link.cloudTenantId,
        cloudBranchId: link.cloudBranchId,
        sqlTenantId: link.sqlTenantId,
        sqlBranchId: link.sqlBranchId,
        tenantName: link.tenantName,
        kasaLoginEmail: link.kasaLoginEmail || null,
        linkedAt: link.linkedAt,
        lastSyncAt: link.lastSyncAt,
        lastSyncError: link.lastSyncError,
      },
    };
  });

  ipcMain.handle('get-hybrid-cloud-session', () => {
    const link = loadSettings().hybridLink || null;
    if (!link?.accessToken || !link.cloudTenantId) {
      return { success: false, error: 'Hibrit bulut oturumu yok' };
    }
    return {
      success: true,
      accessToken: link.accessToken,
      refreshToken: link.refreshToken || null,
      expiresAt: link.expiresAt || null,
      cloudTenantId: link.cloudTenantId,
      cloudBranchId: link.cloudBranchId || null,
    };
  });

  ipcMain.handle('set-hybrid-link', (_, payload) => {
    const p = payload || {};
    if (!p.cloudTenantId || !p.accessToken || !p.sqlTenantId) {
      return { success: false, error: 'cloudTenantId, accessToken ve sqlTenantId zorunlu' };
    }
    saveSettings({
      hybridLink: {
        cloudTenantId: p.cloudTenantId,
        cloudBranchId: p.cloudBranchId || null,
        sqlTenantId: p.sqlTenantId,
        sqlBranchId: p.sqlBranchId || null,
        tenantName: p.tenantName || null,
        kasaLoginEmail: p.kasaLoginEmail || null,
        accessToken: p.accessToken,
        refreshToken: p.refreshToken || null,
        expiresAt: p.expiresAt || null,
        linkedAt: new Date().toISOString(),
        lastSyncAt: null,
        lastSyncError: null,
      },
    });
    return { success: true };
  });

  ipcMain.handle('clear-hybrid-link', () => {
    const current = loadSettings();
    delete current.hybridLink;
    writeSecureJson(settingsSecurePath, current);
    return { success: true };
  });

  ipcMain.handle('hybrid-import-from-cloud', async () => {
    const settings = loadSettings();
    const link = settings.hybridLink;
    if (!link?.accessToken || !link.cloudTenantId) {
      return { success: false, error: 'Önce bulut hesabını bağlayın' };
    }
    const cfg = settings.sqlServerConfig;
    if (!cfg) return { success: false, error: 'SQL yapılandırması yok' };
    try {
      const norm = normalizeSqlServerConfig(cfg);
      await applySqlSchemaPatches(norm);
      const result = await importCatalogFromCloud({
        link,
        accessToken: link.accessToken,
        runSql,
        getSqlParamTypes,
        cfg,
        dbName: cfg.database || 'sefpos45',
        pickSqlRow,
      });
      return { success: true, ...result };
    } catch (err) {
      return { success: false, error: err.message || 'Import hatası' };
    }
  });

  ipcMain.handle('hybrid-sync-now', async () => {
    return runHybridSyncNow({ loadSettings, saveSettings, runSql, getSqlParamTypes, pickSqlRow });
  });
}

module.exports = {
  registerHybridSyncIpc,
  runHybridSyncNow,
  cloudPasswordSignIn,
  fetchCloudProfile,
};
