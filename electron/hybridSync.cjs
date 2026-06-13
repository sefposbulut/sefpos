/**
 * Bulut ↔ SQL Server hibrit senkron (Electron main process).
 * Mobil garson / bulut siparişleri cloud tenant'ta kalır; kasa SQL'de çalışır, online olunca eşitlenir.
 */

const DEFAULT_SUPABASE_URL = 'https://xdfnozfuuzctubijbnds.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_wrSHY5Kzkw-bx0XzYM5VFA_FK3BFF_x';

function supabaseBaseUrl() {
  return (process.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL).replace(/\/$/, '');
}

function supabaseAnonKey() {
  return process.env.VITE_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;
}

async function supabaseRest(path, accessToken, { method = 'GET', body } = {}) {
  const url = `${supabaseBaseUrl()}/rest/v1/${path}`;
  const headers = {
    apikey: supabaseAnonKey(),
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/json',
    Prefer: method === 'POST' ? 'return=minimal,resolution=merge-duplicates' : 'return=representation',
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

async function pullCloudOrders({ link, accessToken, runSql, getSqlParamTypes, cfg, dbName, sinceIso, pickSqlRow }) {
  const TYPES = getSqlParamTypes();
  const { cloudTenantId, cloudBranchId, sqlTenantId, sqlBranchId } = link;
  let pulled = 0;
  const since = sinceIso || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const orders = await supabaseRest(
    `orders?tenant_id=eq.${cloudTenantId}&branch_id=eq.${cloudBranchId}&updated_at=gte.${since}&select=*&order=updated_at.asc`,
    accessToken,
  );

  for (const order of orders || []) {
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
    if (order.table_id) {
      const sqlTableId = await resolveSqlTableIdForCloudOrder(
        runSql,
        TYPES,
        cfg,
        dbName,
        link,
        order.table_id,
        accessToken,
      );
      if (sqlTableId) {
        await runSql(
          `UPDATE restaurant_tables SET status = N'occupied', current_order_id = @oid WHERE id = @tid AND tenant_id = @tenant`,
          {
            oid: { type: TYPES.UniqueIdentifier, value: order.id },
            tid: { type: TYPES.UniqueIdentifier, value: sqlTableId },
            tenant: { type: TYPES.UniqueIdentifier, value: sqlTenantId },
          },
          cfg,
          dbName,
        ).catch(() => {});
      }
    }
    pulled++;
  }
  return { pulled };
}

async function pushLocalOrders({ link, accessToken, runSql, getSqlParamTypes, cfg, dbName }) {
  const TYPES = getSqlParamTypes();
  const { cloudTenantId, cloudBranchId, sqlTenantId } = link;
  let pushed = 0;
  const rows = await runSql(
    `SELECT TOP 40 o.* FROM orders o
     WHERE o.tenant_id = @tenant
       AND o.updated_at >= DATEADD(hour, -48, GETUTCDATE())
     ORDER BY o.updated_at DESC`,
    { tenant: { type: TYPES.UniqueIdentifier, value: sqlTenantId } },
    cfg,
    dbName,
  ).catch(() => []);

  for (const order of rows || []) {
    const payload = {
      ...order,
      tenant_id: cloudTenantId,
      branch_id: cloudBranchId,
    };
    delete payload.row_version;
    try {
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
      pushed++;
    } catch {
      /* RLS veya çakışma — sonraki turda tekrar dene */
    }
  }
  return { pushed };
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

async function runHybridSyncNow(deps) {
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

  try {
    await dedupeRestaurantTablesByNumber(
      runSql,
      getSqlParamTypes(),
      cfg,
      dbName,
      link.sqlTenantId,
      link.sqlBranchId,
      pickSqlRow,
    );
    await dedupeTableGroupsByName(
      runSql,
      getSqlParamTypes(),
      cfg,
      dbName,
      link.sqlTenantId,
      link.sqlBranchId,
    );
    const pull = await pullCloudOrders({ link, accessToken, runSql, getSqlParamTypes, cfg, dbName, sinceIso, pickSqlRow });
    const push = await pushLocalOrders({ link, accessToken, runSql, getSqlParamTypes, cfg, dbName });
    const calls = await pullWaiterCalls({ link, accessToken, runSql, getSqlParamTypes, cfg, dbName, sinceIso, pickSqlRow });
    const now = new Date().toISOString();
    saveSettings({
      hybridLink: { ...link, lastSyncAt: now, lastSyncError: null },
    });
    return {
      success: true,
      pulledOrders: pull.pulled,
      pushedOrders: push.pushed,
      pulledCalls: calls.pulled,
      lastSyncAt: now,
    };
  } catch (err) {
    saveSettings({
      hybridLink: { ...link, lastSyncError: (err.message || '').slice(0, 300) },
    });
    return { success: false, error: err.message || 'Senkron hatası' };
  }
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
