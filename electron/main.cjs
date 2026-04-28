const { app, BrowserWindow, shell, ipcMain, net, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const https = require('https');

let autoUpdater = null;
try {
  autoUpdater = require('electron-updater').autoUpdater;
} catch {}

function setupAutoUpdater() {
  if (!autoUpdater) return;
  if (process.env.NODE_ENV === 'development') return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    console.log('Güncelleme kontrol ediliyor...');
  });

  autoUpdater.on('update-available', (info) => {
    console.log('Güncelleme mevcut:', info.version);
    if (mainWindow) {
      mainWindow.webContents.send('update-available', { version: info.version });
    }
  });

  autoUpdater.on('update-not-available', () => {
    console.log('Uygulama güncel.');
  });

  autoUpdater.on('download-progress', (progress) => {
    if (mainWindow) {
      mainWindow.webContents.send('update-download-progress', {
        percent: Math.round(progress.percent),
        transferred: progress.transferred,
        total: progress.total,
      });
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('Güncelleme indirildi:', info.version);
    if (mainWindow) {
      mainWindow.webContents.send('update-downloaded', { version: info.version });
    }
  });

  autoUpdater.on('error', (err) => {
    console.error('Güncelleme hatası:', err.message);
  });

  setTimeout(() => {
    autoUpdater.checkForUpdatesAndNotify().catch(() => {});
    setInterval(() => {
      autoUpdater.checkForUpdatesAndNotify().catch(() => {});
    }, 2 * 60 * 60 * 1000);
  }, 10000);
}

let bcryptjs = null;
let pgModule = null;

function getBcrypt() {
  if (!bcryptjs) {
    const appPath = (() => { try { return app.getAppPath(); } catch { return __dirname; } })();
    const resourcesPath = process.resourcesPath || path.join(appPath, '..');
    const candidates = [
      path.join(appPath, 'node_modules', 'bcryptjs'),
      path.join(resourcesPath, 'app.asar.unpacked', 'node_modules', 'bcryptjs'),
      path.join(__dirname, '..', 'node_modules', 'bcryptjs'),
      'bcryptjs',
    ];
    for (const p of candidates) {
      try { bcryptjs = require(p); if (bcryptjs) break; } catch {}
    }
  }
  return bcryptjs;
}

function getPg() {
  if (!pgModule) {
    const appPath = (() => { try { return app.getAppPath(); } catch { return __dirname; } })();
    const resourcesPath = process.resourcesPath || path.join(appPath, '..');
    const candidates = [
      path.join(appPath, 'node_modules', 'pg'),
      path.join(resourcesPath, 'app.asar.unpacked', 'node_modules', 'pg'),
      path.join(__dirname, '..', 'node_modules', 'pg'),
      'pg',
    ];
    for (const p of candidates) {
      try { pgModule = require(p); if (pgModule) break; } catch {}
    }
  }
  return pgModule;
}

function normalizePgConfig(cfg) {
  return {
    host: (cfg?.host || 'localhost').trim(),
    port: Number(cfg?.port || 5432),
    database: (cfg?.database || 'sefpos45').trim(),
    user: (cfg?.username || cfg?.user || 'postgres').trim(),
    password: String(cfg?.password || ''),
  };
}

async function pgConnect(cfg, dbOverride) {
  const pg = getPg();
  if (!pg?.Client) throw new Error('pg paketi yuklenemedi. Uygulamayi yeniden yukleyin.');
  const normalized = normalizePgConfig(cfg);
  const client = new pg.Client({
    host: normalized.host,
    port: normalized.port,
    database: dbOverride || normalized.database,
    user: normalized.user,
    password: normalized.password,
    connectionTimeoutMillis: 10000,
    statement_timeout: 30000,
  });
  await client.connect();
  return client;
}

function getTedious() {
  const appPath = (() => { try { return app.getAppPath(); } catch { return __dirname; } })();
  const resourcesPath = process.resourcesPath || path.join(appPath, '..');
  const candidates = [
    path.join(appPath, 'node_modules', 'tedious'),
    path.join(appPath, '..', 'node_modules', 'tedious'),
    path.join(resourcesPath, 'app.asar.unpacked', 'node_modules', 'tedious'),
    path.join(__dirname, '..', 'node_modules', 'tedious'),
    'tedious',
  ];
  for (const p of candidates) {
    try { const m = require(p); if (m) return m; } catch {}
  }
  return null;
}

function buildTediousConfig(cfg, dbName) {
  const rawHost = (cfg.host || 'localhost').trim();
  let server = rawHost;
  let instanceName = cfg.instanceName || undefined;

  const backslashIdx = rawHost.indexOf('\\');
  if (backslashIdx !== -1) {
    const left = rawHost.substring(0, backslashIdx).trim();
    const right = rawHost.substring(backslashIdx + 1).trim();
    server = (left === '.' || left === '') ? 'localhost' : left;
    if (right) instanceName = right;
  }

  const portNum = parseInt(cfg.port || '1433', 10);

  return {
    server,
    authentication: {
      type: 'default',
      options: {
        userName: cfg.username || 'sa',
        password: cfg.password || '',
      },
    },
    options: {
      port: instanceName ? undefined : portNum,
      instanceName: instanceName || undefined,
      database: dbName || cfg.database || 'sefpos45',
      encrypt: cfg.encrypt === true,
      trustServerCertificate: true,
      enableArithAbort: true,
      connectTimeout: 20000,
      requestTimeout: 30000,
      rowCollectionOnDone: true,
      useColumnNames: true,
    },
  };
}

function tediousConnect(cfg, dbName) {
  return new Promise((resolve, reject) => {
    const tedious = getTedious();
    if (!tedious) return reject(new Error('tedious paketi yuklenemedi. Uygulamayi yeniden yukleyin.'));
    const config = buildTediousConfig(cfg, dbName);
    const conn = new tedious.Connection(config);
    conn.on('connect', (err) => {
      if (err) return reject(err);
      resolve(conn);
    });
    conn.on('error', (err) => reject(err));
    conn.connect();
  });
}

function tediousQuery(conn, sql, params) {
  return new Promise((resolve, reject) => {
    const tedious = getTedious();
    const rows = [];
    const req = new tedious.Request(sql, (err, rowCount) => {
      if (err) return reject(err);
      resolve(rows);
    });
    if (params) {
      for (const [name, { type, value }] of Object.entries(params)) {
        req.addParameter(name, type, value);
      }
    }
    req.on('row', (cols) => {
      const row = {};
      for (const col of Object.values(cols)) {
        row[col.metadata.colName] = col.value;
      }
      rows.push(row);
    });
    conn.execSql(req);
  });
}

function tediousClose(conn) {
  try { conn.close(); } catch {}
}

let currentSqlConn = null;
let currentSqlCfg = null;

async function getSqlConn(config) {
  const settings = loadSettings();
  const cfg = config || settings.sqlServerConfig;
  if (!cfg) throw new Error('SQL Server yapılandırması bulunamadı');
  if (currentSqlConn && currentSqlCfg === JSON.stringify(cfg)) {
    return currentSqlConn;
  }
  if (currentSqlConn) { tediousClose(currentSqlConn); currentSqlConn = null; }
  currentSqlConn = await tediousConnect(cfg, cfg.database || 'sefpos45');
  currentSqlCfg = JSON.stringify(cfg);
  currentSqlConn.on('error', () => { currentSqlConn = null; currentSqlCfg = null; });
  return currentSqlConn;
}

function closeSqlPool() {
  if (currentSqlConn) { tediousClose(currentSqlConn); currentSqlConn = null; currentSqlCfg = null; }
}

async function runSql(sql, params, config, dbName) {
  const settings = loadSettings();
  const cfg = config || settings.sqlServerConfig;
  if (!cfg) throw new Error('SQL Server yapılandırması bulunamadı');
  const conn = await tediousConnect(cfg, dbName || cfg.database || 'sefpos45');
  try {
    return await tediousQuery(conn, sql, params);
  } finally {
    tediousClose(conn);
  }
}

function parseSelectWithJoins(selectStr) {
  if (!selectStr || selectStr.trim() === '*') {
    return { mainCols: '*', joins: [] };
  }

  const joins = [];
  let mainCols = [];
  const cleaned = selectStr.replace(/\s+/g, ' ').trim();

  const parseLevel = (str) => {
    const parts = [];
    let depth = 0;
    let current = '';
    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      if (ch === '(') { depth++; current += ch; }
      else if (ch === ')') { depth--; current += ch; }
      else if (ch === ',' && depth === 0) {
        parts.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    if (current.trim()) parts.push(current.trim());
    return parts;
  };

  const parts = parseLevel(cleaned);

  for (const part of parts) {
    const parenIdx = part.indexOf('(');
    if (parenIdx === -1) {
      if (part.trim() === '*' || part.trim() === '') {
        mainCols.push('*');
      } else {
        mainCols.push(part.trim().replace(/[^a-zA-Z0-9_]/g, ''));
      }
    } else {
      let relName = part.substring(0, parenIdx).trim();
      const exclamIdx = relName.indexOf('!');
      if (exclamIdx !== -1) relName = relName.substring(0, exclamIdx);
      relName = relName.replace(/[^a-zA-Z0-9_]/g, '');

      const inner = part.substring(parenIdx + 1, part.length - 1).trim();
      const innerParts = parseLevel(inner);
      const relCols = innerParts.flatMap(ip => {
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

const JOIN_FK_MAP = {
  restaurant_tables: [
    { childTable: 'orders', fk: 'current_order_id', pk: 'id' },
  ],
  table_groups: [
    { childTable: 'branches', fk: 'branch_id', pk: 'id' },
  ],
  restaurant_tables_to_table_groups: [
    { parentTable: 'table_groups', fk: 'group_id', pk: 'id' },
  ],
  cash_register_transactions: [
    { childTable: 'profiles', fk: 'user_id', pk: 'id' },
  ],
  order_items: [
    { childTable: 'products', fk: 'product_id', pk: 'id' },
  ],
  orders: [
    { childTable: 'order_items', fk: 'order_id', pk: 'id' },
  ],
};

function getFkForJoin(mainTable, joinTable) {
  const maps = JOIN_FK_MAP[mainTable] || [];
  for (const m of maps) {
    if (m.childTable === joinTable) return { fk: m.fk, pk: m.pk, direction: 'child' };
    if (m.parentTable === joinTable) return { fk: m.fk, pk: m.pk, direction: 'parent' };
  }
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

async function execSelectWithJoins(table, select, filters, orderBy, limitVal, cfg) {
  const safeId = (c) => c.replace(/[^a-zA-Z0-9_]/g, '');
  const { mainCols, joins } = parseSelectWithJoins(select);

  const prefixedFilters = (filters || []).map(f => {
    if (!f.col) return f;
    if (f.op === 'or' && Array.isArray(f.val)) {
      return { ...f, val: f.val.map(sub => sub.col ? { ...sub, col: `t.${safeId(sub.col)}` } : sub) };
    }
    return { ...f, col: `t.${safeId(f.col)}` };
  });
  const params = {};
  const where = buildWhereTedious(prefixedFilters, params, 'w');
  const top = limitVal ? `TOP ${parseInt(limitVal, 10)}` : '';
  const order = orderBy && orderBy.length > 0
    ? `ORDER BY ${orderBy.map(o => `t.${safeId(o.col)} ${o.asc ? 'ASC' : 'DESC'}`).join(', ')}`
    : '';

  if (joins.length === 0) {
    const cols = mainCols === '*' ? '*' : mainCols;
    const parts = ['SELECT', top, cols, 'FROM', safeId(table), where, order].filter(Boolean);
    return runSql(parts.join(' '), params, cfg);
  }

  const mainColStr = mainCols === '*' ? `t.*` : mainCols.split(',').map(c => `t.${c.trim()}`).join(', ');
  const joinClauses = [];
  const joinSelectParts = [mainColStr];

  for (const j of joins) {
    const rel = getFkForJoin(table, j.table);
    if (!rel) continue;

    const alias = `j_${j.table}`;
    if (rel.direction === 'parent') {
      joinClauses.push(`LEFT JOIN ${safeId(j.table)} ${alias} ON t.${safeId(rel.fk)} = ${alias}.${safeId(rel.pk)}`);
    } else {
      joinClauses.push(`LEFT JOIN ${safeId(j.table)} ${alias} ON ${alias}.${safeId(rel.fk)} = t.${safeId(rel.pk)}`);
    }

    const hasStar = j.cols.includes('*');
    const jCols = hasStar
      ? `${alias}.*`
      : j.cols.filter(Boolean).map(c => `${alias}.${safeId(c)} AS [${j.table}__${safeId(c)}]`).join(', ');
    if (jCols) joinSelectParts.push(jCols);

    const rel2 = getFkForJoin(j.table, 'categories');
    if (rel2) {
      const alias2 = `j_${j.table}_categories`;
      joinClauses.push(`LEFT JOIN categories ${alias2} ON ${alias}.${safeId(rel2.fk)} = ${alias2}.${safeId(rel2.pk)}`);
      joinSelectParts.push(`${alias2}.* AS categories_star`);
    }
  }

  const wherePart = where || '';
  const q = ['SELECT', top, joinSelectParts.join(', '), 'FROM', `${safeId(table)} t`, ...joinClauses, wherePart, order]
    .filter(Boolean).join(' ').trim();

  const rows = await runSql(q, params, cfg);

  if (!rows || rows.length === 0) return rows;

  return rows.map(row => {
    const main = {};
    const nested = {};

    for (const [key, val] of Object.entries(row)) {
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
      const allNull = Object.values(data).every(v => v === null);
      main[tbl] = allNull ? null : data;
    }

    return main;
  });
}

function buildWhereTedious(filters, params, prefix) {
  if (!filters || filters.length === 0) return '';
  let pi = Object.keys(params).length;
  const safeId = (c) => {
    const parts = String(c).split('.');
    if (parts.length === 2) return `${parts[0].replace(/[^a-zA-Z0-9_]/g, '')}.${parts[1].replace(/[^a-zA-Z0-9_]/g, '')}`;
    return c.replace(/[^a-zA-Z0-9_]/g, '');
  };
  const addParam = (val) => {
    const tedious = getTedious();
    const name = `${prefix || 'f'}${pi++}`;
    if (val === null || val === undefined) params[name] = { type: tedious.TYPES.NVarChar, value: null };
    else if (typeof val === 'boolean') params[name] = { type: tedious.TYPES.Bit, value: val ? 1 : 0 };
    else if (typeof val === 'number' && Number.isInteger(val)) params[name] = { type: tedious.TYPES.Int, value: val };
    else if (typeof val === 'number') params[name] = { type: tedious.TYPES.Decimal, value: val };
    else params[name] = { type: tedious.TYPES.NVarChar, value: String(val) };
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
      return `${safeId(f.col)} IN (${f.val.map(v => addParam(v)).join(', ')})`;
    }
    if (f.op === 'not_in' && Array.isArray(f.val)) {
      if (f.val.length === 0) return '1=1';
      return `${safeId(f.col)} NOT IN (${f.val.map(v => addParam(v)).join(', ')})`;
    }
    if (f.op === 'or' && Array.isArray(f.val)) {
      const orParts = f.val.map(buildCondition).filter(Boolean);
      return orParts.length > 0 ? `(${orParts.join(' OR ')})` : '1=1';
    }
    return '1=1';
  };
  const parts = filters.map(buildCondition);
  return `WHERE ${parts.join(' AND ')}`;
}

function addTediousParam(params, name, val) {
  const tedious = getTedious();
  if (val === null || val === undefined) params[name] = { type: tedious.TYPES.NVarChar, value: null };
  else if (typeof val === 'boolean') params[name] = { type: tedious.TYPES.Bit, value: val ? 1 : 0 };
  else if (typeof val === 'number' && Number.isInteger(val)) params[name] = { type: tedious.TYPES.Int, value: val };
  else if (typeof val === 'number') params[name] = { type: tedious.TYPES.Decimal, value: val };
  else params[name] = { type: tedious.TYPES.NVarChar, value: String(val) };
}

let mainWindow;
let printAgentServer = null;
const PRINT_AGENT_PORT = 7878;

const SUPABASE_URL = 'https://orlydeyxshsdusxukhuu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ybHlkZXl4c2hzZHVzeHVraHV1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0NjI0MTcsImV4cCI6MjA5MDAzODQxN30.tbFxkDsVyw0b97l8bop5prHlxDhmmfnsc8rC8zP8FqI';

const isDev = process.env.NODE_ENV === 'development';
const settingsPath = path.join(app.getPath('userData'), 'settings.json');
const localDbPath = path.join(app.getPath('userData'), 'localdb.json');

function loadLocalDb() {
  try {
    if (fs.existsSync(localDbPath)) {
      return JSON.parse(fs.readFileSync(localDbPath, 'utf8'));
    }
  } catch {}
  return { tenants: [], branches: [], roles: [], users: [], profiles: [] };
}

function saveLocalDb(db) {
  try {
    fs.writeFileSync(localDbPath, JSON.stringify(db, null, 2));
  } catch (e) {
    console.error('LocalDB save error:', e);
  }
}

function localDbEnsureDefaults(db) {
  if (!db.tenants) db.tenants = [];
  if (!db.branches) db.branches = [];
  if (!db.roles) db.roles = [];
  if (!db.users) db.users = [];
  if (!db.profiles) db.profiles = [];
  if (!db.table_groups) db.table_groups = [];
  if (!db.restaurant_tables) db.restaurant_tables = [];
  if (!db.orders) db.orders = [];
  if (!db.order_items) db.order_items = [];
  if (!db.categories) db.categories = [];
  if (!db.products) db.products = [];
  if (!db.cash_register_transactions) db.cash_register_transactions = [];
  if (!db.cancel_logs) db.cancel_logs = [];
  if (!db.couriers) db.couriers = [];
  if (!db.delivery_orders) db.delivery_orders = [];
  return db;
}

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
};

async function localDbCreateTenantAndUser({ email, password, fullName, tenantName }) {
  const bcrypt = getBcrypt();
  if (!bcrypt) throw new Error('bcryptjs yuklenemedi');
  const crypto = require('crypto');
  const db = localDbEnsureDefaults(loadLocalDb());

  const existing = db.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (existing) throw new Error('Bu e-posta zaten kayitli');

  const tenantId = crypto.randomUUID();
  const branchId = crypto.randomUUID();
  const roleId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  const profileId = crypto.randomUUID();
  const now = new Date().toISOString();

  const slug = (tenantName || 'isletme').toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').slice(0, 50);

  db.tenants.push({
    id: tenantId,
    name: tenantName || 'Isletme',
    slug,
    subscription_status: 'active',
    deployment_mode: 'local',
    onboarding_completed: true,
    created_at: now,
  });

  db.branches.push({
    id: branchId,
    tenant_id: tenantId,
    name: 'Ana Sube',
    is_main: true,
    is_active: true,
    created_at: now,
  });

  db.roles.push({
    id: roleId,
    tenant_id: tenantId,
    name: 'Yonetici',
    permissions: DEFAULT_PERMISSIONS,
    created_at: now,
  });

  const passwordHash = await bcrypt.hash(String(password), 10);

  db.users.push({
    id: userId,
    email: email.toLowerCase(),
    password_hash: passwordHash,
    tenant_id: tenantId,
    created_at: now,
  });

  db.profiles.push({
    id: profileId,
    user_id: userId,
    tenant_id: tenantId,
    branch_id: branchId,
    role_id: roleId,
    role: 'owner',
    full_name: fullName || 'Admin',
    email: email.toLowerCase(),
    onboarding_completed: true,
    created_at: now,
  });

  saveLocalDb(db);
  return { userId, tenantId, branchId, roleId, profileId };
}

async function localDbLogin({ email, password }) {
  const bcrypt = getBcrypt();
  if (!bcrypt) throw new Error('bcryptjs yuklenemedi');
  const db = localDbEnsureDefaults(loadLocalDb());

  const user = db.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (!user) throw new Error('Kullanici bulunamadi: ' + email);

  const match = await bcrypt.compare(String(password), String(user.password_hash));
  if (!match) throw new Error('Sifre hatali');

  const profile = db.profiles.find(p => p.user_id === user.id);
  if (!profile) throw new Error('Profil bulunamadi');

  const tenant = db.tenants.find(t => t.id === profile.tenant_id);
  const branch = db.branches.find(b => b.id === profile.branch_id);
  const role = db.roles.find(r => r.id === profile.role_id);

  const tenantOnboardingDone = tenant ? (tenant.onboarding_completed === true) : false;

  return {
    user_id: user.id,
    email: user.email,
    profile_id: profile.id,
    tenant_id: profile.tenant_id,
    branch_id: profile.branch_id,
    role_id: profile.role_id,
    full_name: profile.full_name,
    role: profile.role || 'owner',
    is_super_admin: false,
    onboarding_completed: tenantOnboardingDone,
    allowed_ips: null,
    tenant_name: tenant ? tenant.name : 'Isletme',
    tenant_slug: tenant ? tenant.slug : 'isletme',
    subscription_status: tenant ? (tenant.subscription_status || 'active') : 'active',
    deployment_mode: 'local',
    lock_pin: profile.lock_pin || null,
    require_cancel_reason: false,
    tenant_onboarding: tenantOnboardingDone,
    printer_settings: profile.printer_settings || null,
    branch_name: branch ? branch.name : 'Ana Sube',
    branch_is_main: branch ? branch.is_main : true,
    role_permissions: role ? role.permissions : DEFAULT_PERMISSIONS,
  };
}

async function localDbAddUser({ email, password, fullName, tenantId, branchId, roleId, role }) {
  const bcrypt = getBcrypt();
  if (!bcrypt) throw new Error('bcryptjs yuklenemedi');
  const crypto = require('crypto');
  const db = localDbEnsureDefaults(loadLocalDb());

  const existing = db.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (existing) throw new Error('Bu e-posta zaten kayitli');

  const userId = crypto.randomUUID();
  const profileId = crypto.randomUUID();
  const now = new Date().toISOString();
  const passwordHash = await bcrypt.hash(String(password), 10);

  db.users.push({ id: userId, email: email.toLowerCase(), password_hash: passwordHash, tenant_id: tenantId, created_at: now });
  db.profiles.push({ id: profileId, user_id: userId, tenant_id: tenantId, branch_id: branchId || null, role_id: roleId || null, role: role || 'waiter', full_name: fullName || email, email: email.toLowerCase(), onboarding_completed: true, created_at: now });

  saveLocalDb(db);
  return { userId, profileId };
}

function localDbGetUsers(tenantId) {
  const db = localDbEnsureDefaults(loadLocalDb());
  return db.profiles.filter(p => p.tenant_id === tenantId).map(p => {
    const role = db.roles.find(r => r.id === p.role_id);
    const branch = db.branches.find(b => b.id === p.branch_id);
    return { ...p, roles: role || null, branches: branch || null };
  });
}

function localDbGetRoles(tenantId) {
  const db = localDbEnsureDefaults(loadLocalDb());
  return db.roles.filter(r => r.tenant_id === tenantId);
}

function localDbGetBranches(tenantId) {
  const db = localDbEnsureDefaults(loadLocalDb());
  return db.branches.filter(b => b.tenant_id === tenantId);
}

function localDbUpdateProfile(profileId, updates) {
  const db = localDbEnsureDefaults(loadLocalDb());
  const idx = db.profiles.findIndex(p => p.id === profileId);
  if (idx >= 0) { db.profiles[idx] = { ...db.profiles[idx], ...updates }; saveLocalDb(db); }
}

async function localDbChangePassword(userId, newPassword) {
  const bcrypt = getBcrypt();
  if (!bcrypt) throw new Error('bcryptjs yuklenemedi');
  const db = localDbEnsureDefaults(loadLocalDb());
  const idx = db.users.findIndex(u => u.id === userId);
  if (idx < 0) throw new Error('Kullanici bulunamadi');
  db.users[idx].password_hash = await bcrypt.hash(String(newPassword), 10);
  saveLocalDb(db);
}

function localDbIsEmpty() {
  const db = localDbEnsureDefaults(loadLocalDb());
  return db.users.length === 0;
}

function localDbGetTerminalUsers(tenantId) {
  const db = localDbEnsureDefaults(loadLocalDb());
  const profiles = tenantId ? db.profiles.filter(p => p.tenant_id === tenantId) : db.profiles;
  return profiles.map(p => ({
    id: p.user_id || p.id,
    username: p.email.split('@')[0],
    full_name: p.full_name,
    role: p.role || 'waiter',
  }));
}

function loadSettings() {
  try {
    if (fs.existsSync(settingsPath)) {
      return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    }
  } catch {}
  return {};
}

function saveSettings(data) {
  try {
    const current = loadSettings();
    fs.writeFileSync(settingsPath, JSON.stringify({ ...current, ...data }, null, 2));
  } catch {}
}

function buildFullHtml(html) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 12px;
    width: 72mm;
    max-width: 72mm;
    color: #000;
    background: #fff;
  }
  .receipt {
    width: 72mm;
    max-width: 72mm;
    padding: 0 1mm;
  }
  .center { text-align: center; width: 100%; display: block; }
  .bold { font-weight: bold; }
  .large { font-size: 14px; }
  .xlarge { font-size: 16px; font-weight: bold; }
  .line { border-top: 1px dashed #000; margin: 3px 0; width: 100%; }
  .row {
    display: table;
    width: 100%;
    table-layout: fixed;
    margin: 1px 0;
  }
  .row span {
    display: table-cell;
    vertical-align: top;
    overflow: hidden;
    word-break: break-all;
  }
  .row .name { width: 55%; }
  .row .qty { width: 15%; text-align: center; }
  .row .price { width: 30%; text-align: right; }
  .total-row {
    display: table;
    width: 100%;
    table-layout: fixed;
    font-weight: bold;
    margin: 2px 0;
    font-size: 14px;
  }
  .total-row span { display: table-cell; vertical-align: top; }
  .total-row span:last-child { text-align: right; }
  .note { font-size: 10px; padding-left: 4px; font-style: italic; }
  .footer { text-align: center; font-size: 10px; margin-top: 6px; word-break: break-word; }
  @page { margin: 0; size: 72mm auto; }
  @media print {
    html, body { width: 72mm; }
  }
</style>
</head>
<body>
<div class="receipt">
${html}
</div>
</body>
</html>`;
}

async function doPrint(html, printerName, silent) {
  let tmpFile = null;
  try {
    const fullHtml = buildFullHtml(html);
    tmpFile = path.join(os.tmpdir(), `shefpos_print_${Date.now()}.html`);
    fs.writeFileSync(tmpFile, fullHtml, 'utf8');

    const printWin = new BrowserWindow({
      width: 400,
      height: 800,
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    printWindows.push(printWin);

    await new Promise((resolve, reject) => {
      printWin.webContents.on('did-finish-load', resolve);
      printWin.webContents.on('did-fail-load', (_, errCode, errDesc) => reject(new Error(errDesc)));
      printWin.loadFile(tmpFile);
    });

    await new Promise(resolve => setTimeout(resolve, 800));

    return new Promise((resolve) => {
      const opts = {
        silent: silent !== false,
        printBackground: false,
        color: false,
        margins: { marginType: 'none' },
        pageSize: { width: 72000, height: 2000000 },
      };

      if (printerName) opts.deviceName = printerName;

      printWin.webContents.print(opts, (success, errorType) => {
        setTimeout(() => {
          if (!printWin.isDestroyed()) printWin.close();
          printWindows = printWindows.filter(w => w !== printWin);
          if (tmpFile) {
            try { fs.unlinkSync(tmpFile); } catch {}
          }
        }, 3000);
        resolve({ success, errorType: errorType || null });
      });
    });
  } catch (err) {
    if (tmpFile) {
      try { fs.unlinkSync(tmpFile); } catch {}
    }
    return { success: false, errorType: err.message };
  }
}

async function getSystemPrinters() {
  if (!mainWindow) return [];
  try {
    const printers = await mainWindow.webContents.getPrintersAsync();
    return printers.map(p => ({
      name: p.name,
      description: p.description || '',
      status: p.status,
      isDefault: p.isDefault,
    }));
  } catch {
    return [];
  }
}

function supabaseFetch(endpoint, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(SUPABASE_URL + endpoint);
    const reqOptions = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: options.method || 'GET',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
        ...(options.headers || {}),
      },
    };

    const req = https.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, data: JSON.parse(data || '[]') });
        } catch {
          resolve({ ok: false, status: res.statusCode, data: null });
        }
      });
    });

    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function updatePrintJobStatus(jobId, status, error) {
  try {
    const body = JSON.stringify({ status, updated_at: new Date().toISOString(), ...(error !== undefined ? { error } : {}) });
    await supabaseFetch(`/rest/v1/print_jobs?id=eq.${jobId}`, {
      method: 'PATCH',
      headers: currentUserJwt ? { 'Authorization': `Bearer ${currentUserJwt}` } : {},
      body,
    });
  } catch (err) {
    console.error('Print job durumu güncellenemedi:', err.message);
  }
}

const processingJobIds = new Set();

async function processPrintJob(job) {
  if (processingJobIds.has(job.id)) {
    console.log(`Print job zaten işleniyor, atlanıyor: ${job.id}`);
    return;
  }
  processingJobIds.add(job.id);

  console.log(`Print job işleniyor: ${job.id}, yazıcı: ${job.printer_name || 'varsayılan'}`);

  try {
    const claimed = await supabaseFetch(
      `/rest/v1/print_jobs?id=eq.${job.id}&status=eq.pending`,
      {
        method: 'PATCH',
        headers: { 'Prefer': 'return=representation', ...(currentUserJwt ? { 'Authorization': `Bearer ${currentUserJwt}` } : {}) },
        body: JSON.stringify({ status: 'processing', updated_at: new Date().toISOString() }),
      }
    );

    if (!claimed.ok || !Array.isArray(claimed.data) || claimed.data.length === 0) {
      console.log(`Print job başka süreç tarafından alındı veya zaten işlendi: ${job.id}`);
      processingJobIds.delete(job.id);
      return;
    }

    const result = await doPrint(job.html, job.printer_name || '', true);
    if (result.success) {
      await updatePrintJobStatus(job.id, 'done', '');
      console.log(`Print job tamamlandı: ${job.id}`);
    } else {
      await updatePrintJobStatus(job.id, 'failed', result.errorType || 'Bilinmeyen hata');
      console.error(`Print job başarısız: ${job.id} - ${result.errorType}`);
    }
  } catch (err) {
    await updatePrintJobStatus(job.id, 'failed', err.message);
    console.error(`Print job hatası: ${job.id} - ${err.message}`);
  } finally {
    processingJobIds.delete(job.id);
  }
}

async function fetchPendingJobs() {
  try {
    const tenantFilter = currentTenantId ? `&tenant_id=eq.${currentTenantId}` : '';
    const headers = currentUserJwt ? { 'Authorization': `Bearer ${currentUserJwt}` } : {};
    const result = await supabaseFetch(
      `/rest/v1/print_jobs?status=eq.pending${tenantFilter}&order=created_at.asc&limit=20`,
      { headers }
    );
    if (result.ok && Array.isArray(result.data)) {
      for (const job of result.data) {
        await processPrintJob(job);
      }
    }
  } catch (err) {
    console.error('Bekleyen print job\'lar alınamadı:', err.message);
  }
}

let realtimeWs = null;
let realtimeReconnectTimer = null;
let realtimeConnected = false;
let currentTenantId = null;
let currentUserJwt = null;
let connectivityLastOnline = null;

function connectRealtimePrintAgent() {
  // Do not open realtime socket before authenticated tenant context exists.
  if (!currentTenantId || !currentUserJwt) return;

  if (realtimeWs) {
    try { realtimeWs.close(); } catch {}
    realtimeWs = null;
  }

  const token = currentUserJwt || SUPABASE_ANON_KEY;
  const wsUrl = SUPABASE_URL.replace('https://', 'wss://') + '/realtime/v1/websocket?apikey=' + SUPABASE_ANON_KEY + '&vsn=1.0.0';

  const { WebSocket } = require('ws');
  const ws = new WebSocket(wsUrl, { headers: { 'Authorization': `Bearer ${token}` } });
  realtimeWs = ws;

  let heartbeatInterval = null;
  let msgRef = 1;

  ws.on('open', () => {
    realtimeConnected = true;
    console.log('Supabase Realtime bağlandı (Print Agent)');

    const filter = currentTenantId
      ? `tenant_id=eq.${currentTenantId}`
      : undefined;

    const payload = {
      config: {
        broadcast: { self: false },
        presence: { key: '' },
        postgres_changes: [{
          event: 'INSERT',
          schema: 'public',
          table: 'print_jobs',
          ...(filter ? { filter } : {}),
        }],
      },
    };

    if (currentUserJwt) {
      payload.access_token = currentUserJwt;
    }

    ws.send(JSON.stringify({
      topic: 'realtime:public:print_jobs',
      event: 'phx_join',
      payload,
      ref: String(msgRef++),
    }));

    heartbeatInterval = setInterval(() => {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: String(msgRef++) }));
      }
    }, 25000);

    fetchPendingJobs();
  });

  ws.on('message', async (data) => {
    try {
      const msg = JSON.parse(data.toString());

      if (msg.event === 'postgres_changes' && msg.payload?.data?.type === 'INSERT') {
        const record = msg.payload.data.record;
        if (record && record.status === 'pending') {
          if (!currentTenantId || record.tenant_id === currentTenantId) {
            await processPrintJob(record);
          }
        }
      }
    } catch (err) {
      console.error('Realtime mesaj hatası:', err.message);
    }
  });

  ws.on('close', () => {
    realtimeConnected = false;
    if (heartbeatInterval) { clearInterval(heartbeatInterval); heartbeatInterval = null; }
    console.log('Supabase Realtime bağlantısı kesildi. 5 saniye sonra yeniden bağlanılacak...');
    realtimeReconnectTimer = setTimeout(connectRealtimePrintAgent, 5000);
  });

  ws.on('error', (err) => {
    console.error('Realtime WebSocket hatası:', err.message);
  });
}

function startPrintAgent() {
  const http = require('http');
  printAgentServer = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    if (req.method === 'GET' && req.url === '/printers') {
      try {
        const printers = await getSystemPrinters();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, printers }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
      return;
    }

    if (req.method === 'GET' && req.url === '/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, version: '1.0', app: 'ShefPOS Print Agent', realtime: realtimeConnected }));
      return;
    }

    if (req.method === 'POST' && req.url === '/print') {
      let body = '';
      req.on('data', chunk => { body += chunk.toString(); });
      req.on('end', async () => {
        try {
          const { html, printerName, silent } = JSON.parse(body);
          if (!html) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'html parametresi gerekli' }));
            return;
          }
          const result = await doPrint(html, printerName, silent);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: err.message }));
        }
      });
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: 'Not found' }));
  });

  printAgentServer.listen(PRINT_AGENT_PORT, '127.0.0.1', () => {
    console.log(`ShefPOS Print Agent dinleniyor: http://127.0.0.1:${PRINT_AGENT_PORT}`);
  });

  printAgentServer.on('error', (err) => {
    console.error('Print Agent sunucu hatası:', err.message);
  });

  try {
    require('ws');
    // Realtime is started lazily after register-printers call with tenant + jwt.
  } catch {
    console.warn('ws paketi bulunamadı, Realtime devre dışı. Sadece local HTTP agent aktif.');
  }
}

function injectOfflineBanner() {
  if (!mainWindow) return;
  mainWindow.webContents.executeJavaScript(`
    (function() {
      if (document.getElementById('__offline_banner__')) return;
      var banner = document.createElement('div');
      banner.id = '__offline_banner__';
      banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#b45309;color:#fff;text-align:center;padding:6px 12px;font-size:13px;font-weight:bold;font-family:sans-serif;';
      banner.textContent = 'Bağlantı yok — Çevrimdışı modda çalışıyor';
      document.body.prepend(banner);
    })();
  `).catch(() => {});
}

function removeOfflineBanner() {
  if (!mainWindow) return;
  mainWindow.webContents.executeJavaScript(`
    (function() {
      var b = document.getElementById('__offline_banner__');
      if (b) b.remove();
    })();
  `).catch(() => {});
}

function watchConnectivity() {
  if (!mainWindow) return;
  connectivityLastOnline = net.isOnline();

  setInterval(() => {
    const online = net.isOnline();
    if (online === connectivityLastOnline) return;
    connectivityLastOnline = online;
    if (!online) injectOfflineBanner();
    else removeOfflineBanner();
  }, 15000);
}

function createWindow() {
  const settings = loadSettings();
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
      partition: 'persist:shefpos',
      backgroundThrottling: false,
    },
    icon: path.join(__dirname, '../public/SEFPOS.png'),
    title: 'Sefpos',
    show: false,
    backgroundColor: '#0f172a',
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.maximize();
    if (settings.zoomFactor) {
      mainWindow.webContents.setZoomFactor(settings.zoomFactor);
    }
    watchConnectivity();
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    const indexPath = path.join(app.getAppPath(), 'dist', 'index.html');
    mainWindow.loadFile(indexPath);
  }

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, _errorDescription) => {
    if (!isDev && errorCode !== -3) {
      const indexPath = path.join(app.getAppPath(), 'dist', 'index.html');
      mainWindow.loadFile(indexPath);
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

ipcMain.handle('get-zoom', () => {
  const settings = loadSettings();
  return settings.zoomFactor || null;
});

ipcMain.handle('set-zoom', (_, zoomFactor) => {
  if (mainWindow) {
    mainWindow.webContents.setZoomFactor(zoomFactor);
    saveSettings({ zoomFactor });
  }
  return true;
});

ipcMain.handle('get-db-mode', () => {
  const settings = loadSettings();
  return settings.dbMode || null;
});

ipcMain.handle('set-db-mode', (_, mode) => {
  saveSettings({ dbMode: mode });
  return true;
});

ipcMain.handle('get-sqlserver-config', () => {
  const settings = loadSettings();
  return settings.sqlServerConfig || null;
});

ipcMain.handle('set-sqlserver-config', (_, config) => {
  saveSettings({ sqlServerConfig: config });
  return true;
});

ipcMain.handle('import-sqlserver-schema', async (_, config) => {
  const candidates = isDev
    ? [path.join(__dirname, '../shefpos_sqlserver.sql')]
    : [
        path.join(process.resourcesPath, 'shefpos_sqlserver.sql'),
        path.join(process.resourcesPath, 'app', 'shefpos_sqlserver.sql'),
        path.join(app.getAppPath(), 'shefpos_sqlserver.sql'),
        path.join(__dirname, '../shefpos_sqlserver.sql'),
        path.join(__dirname, '../../shefpos_sqlserver.sql'),
      ];

  const sqlFile = candidates.find(p => fs.existsSync(p));

  if (!sqlFile) {
    return { success: false, error: 'Schema dosyasi bulunamadi. Aranan konumlar: ' + candidates.join(', ') };
  }

  if (!getTedious()) {
    return { success: false, error: 'tedious paketi yuklenemedi. Uygulamayi yeniden yukleyin.' };
  }

  try {
    const masterConn = await tediousConnect(config, 'master');
    try {
      await tediousQuery(masterConn, `IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = N'sefpos45') CREATE DATABASE [sefpos45]`, null);
    } finally {
      tediousClose(masterConn);
    }

    const schemaContent = fs.readFileSync(sqlFile, 'utf8');
    const goBatches = schemaContent
      .split(/^\s*GO\s*$/im)
      .map(b => b.trim())
      .filter(b => b.length > 0 && !/^USE\s+\[?sefpos45\]?\s*$/i.test(b));

    let executed = 0;
    const errors = [];
    for (const batch of goBatches) {
      const batchConn = await tediousConnect(config, 'sefpos45');
      try {
        await tediousQuery(batchConn, batch, null);
        executed++;
      } catch (batchErr) {
        const msg = batchErr.message || '';
        const isAlreadyExists = /already an object|already exists|Cannot add.*already|Violation of PRIMARY KEY/i.test(msg);
        if (!isAlreadyExists) {
          errors.push(msg.slice(0, 200));
        }
      } finally {
        tediousClose(batchConn);
      }
    }

    if (errors.length > 0 && executed === 0) {
      return { success: false, error: errors.slice(0, 3).join(' | ') };
    }

    let adminCreated = false;
    try {
      const bcrypt = getBcrypt();
      if (bcrypt) {
        const adminEmail = 'admin@shefpos.local';
        const existing = await runSql(
          `SELECT COUNT(*) AS cnt FROM app_users WHERE email = @email`,
          { email: { type: getTedious().TYPES.NVarChar, value: adminEmail } },
          config,
          'sefpos45'
        );
        const cnt = existing && existing[0] ? (Number(existing[0].cnt) || 0) : 0;
        if (cnt === 0) {
          const hash = await bcrypt.hash('1234', 10);
          await runSql(
            `EXEC sp_create_tenant_and_user @email, @password_hash, @full_name, @tenant_name, @tenant_slug`,
            {
              email: { type: getTedious().TYPES.NVarChar, value: adminEmail },
              password_hash: { type: getTedious().TYPES.NVarChar, value: hash },
              full_name: { type: getTedious().TYPES.NVarChar, value: 'Admin' },
              tenant_name: { type: getTedious().TYPES.NVarChar, value: 'Varsayilan Isletme' },
              tenant_slug: { type: getTedious().TYPES.NVarChar, value: 'varsayilan-isletme' },
            },
            config,
            'sefpos45'
          );
          adminCreated = true;
        }
      }
    } catch (adminErr) {
      errors.push('Admin kullanici olusturulamadi: ' + (adminErr.message || '').slice(0, 150));
    }

    return {
      success: true,
      adminCreated,
      output: `${executed} batch yuklendi.${adminCreated ? ' Admin kullanici olusturuldu (admin / 1234).' : ''}${errors.length > 0 ? ' ' + errors.length + ' uyari.' : ''}`,
    };
  } catch (err) {
    return { success: false, error: err.message || 'Bilinmeyen hata' };
  }
});

ipcMain.handle('get-printers', async () => {
  return await getSystemPrinters();
});

let printWindows = [];

ipcMain.handle('print-receipt', async (_, { html, printerName, silent }) => {
  return await doPrint(html, printerName, silent);
});

ipcMain.handle('register-printers', async (_, { tenantId, branchId, userJwt }) => {
  try {
    const tenantChanged = currentTenantId !== tenantId;
    currentTenantId = tenantId;
    currentUserJwt = userJwt;

    const printers = await getSystemPrinters();

    const checkRes = await supabaseFetch(
      `/rest/v1/printer_registrations?tenant_id=eq.${tenantId}&select=id`,
      { headers: { 'Authorization': `Bearer ${userJwt}` } }
    );

    if (checkRes.ok && Array.isArray(checkRes.data) && checkRes.data.length > 0) {
      await supabaseFetch(
        `/rest/v1/printer_registrations?tenant_id=eq.${tenantId}`,
        {
          method: 'PATCH',
          headers: { 'Authorization': `Bearer ${userJwt}`, 'Prefer': 'return=minimal' },
          body: JSON.stringify({ printers, last_seen_at: new Date().toISOString(), branch_id: branchId || null }),
        }
      );
    } else {
      await supabaseFetch(
        `/rest/v1/printer_registrations`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${userJwt}`, 'Prefer': 'return=minimal' },
          body: JSON.stringify({ tenant_id: tenantId, branch_id: branchId || null, printers, last_seen_at: new Date().toISOString() }),
        }
      );
    }

    if (tenantChanged || !realtimeConnected) {
      console.log('Tenant değişti, Realtime yeniden bağlanıyor...');
      processingJobIds.clear();
      connectRealtimePrintAgent();
    } else {
      fetchPendingJobs();
    }

    return { success: true, count: printers.length };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('sql-test-connection', async (_, config) => {
  closeSqlPool();
  if (!getTedious()) {
    return { success: false, error: 'tedious paketi yuklenemedi. Uygulamayi yeniden yukleyin.' };
  }
  try {
    const conn = await tediousConnect(config, config.database || 'master');
    await tediousQuery(conn, 'SELECT 1 AS ok', null);
    tediousClose(conn);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message || 'Bağlantı başarısız' };
  }
});

ipcMain.handle('postgres-test-connection', async (_, config) => {
  try {
    const client = await pgConnect(config);
    try {
      await client.query('SELECT 1 AS ok');
    } finally {
      await client.end();
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message || 'Bağlantı başarısız' };
  }
});

ipcMain.handle('postgres-init-database', async (_, config) => {
  try {
    const norm = normalizePgConfig(config);
    const adminClient = await pgConnect(norm, 'postgres');
    try {
      const exists = await adminClient.query('SELECT 1 FROM pg_database WHERE datname = $1 LIMIT 1', [norm.database]);
      if ((exists?.rows || []).length === 0) {
        await adminClient.query(`CREATE DATABASE "${norm.database.replace(/"/g, '""')}"`);
      }
    } finally {
      await adminClient.end();
    }

    const appClient = await pgConnect(norm, norm.database);
    try {
      await appClient.query(`
        CREATE TABLE IF NOT EXISTS app_users (
          id uuid PRIMARY KEY,
          email text UNIQUE NOT NULL,
          password_hash text NOT NULL,
          tenant_id uuid NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now()
        )
      `);
      await appClient.query(`
        CREATE TABLE IF NOT EXISTS tenants (
          id uuid PRIMARY KEY,
          name text NOT NULL,
          slug text NOT NULL,
          subscription_status text NOT NULL DEFAULT 'active',
          deployment_mode text,
          onboarding_completed boolean DEFAULT false,
          created_at timestamptz NOT NULL DEFAULT now()
        )
      `);
      await appClient.query(`
        CREATE TABLE IF NOT EXISTS branches (
          id uuid PRIMARY KEY,
          tenant_id uuid NOT NULL,
          name text NOT NULL,
          is_main boolean DEFAULT true,
          is_active boolean DEFAULT true,
          created_at timestamptz NOT NULL DEFAULT now()
        )
      `);
      await appClient.query(`
        CREATE TABLE IF NOT EXISTS roles (
          id uuid PRIMARY KEY,
          tenant_id uuid NOT NULL,
          name text NOT NULL,
          permissions jsonb,
          created_at timestamptz NOT NULL DEFAULT now()
        )
      `);
      await appClient.query(`
        CREATE TABLE IF NOT EXISTS profiles (
          id uuid PRIMARY KEY,
          user_id uuid NOT NULL,
          tenant_id uuid NOT NULL,
          branch_id uuid,
          role_id uuid,
          role text NOT NULL DEFAULT 'owner',
          full_name text,
          email text,
          onboarding_completed boolean DEFAULT true,
          is_super_admin boolean DEFAULT false,
          created_at timestamptz NOT NULL DEFAULT now()
        )
      `);
    } finally {
      await appClient.end();
    }

    return { success: true, output: `${norm.database} veritabanı hazırlandı.` };
  } catch (err) {
    return { success: false, error: err.message || 'PostgreSQL kurulum hatası' };
  }
});

ipcMain.handle('sql-login', async (_, { email, password }) => {
  try {
    const bcrypt = getBcrypt();
    if (!bcrypt) return { success: false, error: 'bcryptjs paketi yuklenemedi' };
    const tedious = getTedious();
    if (!tedious) return { success: false, error: 'tedious paketi yuklenemedi' };
    const rows = await runSql(
      `EXEC sp_get_user_by_email @email`,
      { email: { type: tedious.TYPES.NVarChar, value: email } }
    );
    const row = rows && rows[0];
    if (!row) return { success: false, error: 'Kullanici bulunamadi: ' + email };
    if (!row.password_hash) return { success: false, error: 'Sifre hash bulunamadi - veritabanini yeniden kurun' };
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
      subscription_status: row.subscription_status,
      deployment_mode: row.deployment_mode,
      lock_pin: row.lock_pin,
      require_cancel_reason: row.require_cancel_reason === true || row.require_cancel_reason === 1,
      tenant_onboarding: row.tenant_onboarding === true || row.tenant_onboarding === 1,
      printer_settings: row.printer_settings,
      branch_name: row.branch_name,
      branch_is_main: row.branch_is_main === true || row.branch_is_main === 1,
      role_permissions: row.role_permissions,
    };
    return { success: true, data: userRecord };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('sql-register', async (_, { email, passwordHash, fullName, tenantName, tenantSlug }) => {
  try {
    const tedious = getTedious();
    if (!tedious) return { success: false, error: 'tedious paketi yuklenemedi' };
    const slug = (tenantSlug || tenantName || '').toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').slice(0, 50) || 'isletme';
    const rows = await runSql(
      `EXEC sp_create_tenant_and_user @email, @password_hash, @full_name, @tenant_name, @tenant_slug`,
      {
        email: { type: tedious.TYPES.NVarChar, value: email },
        password_hash: { type: tedious.TYPES.NVarChar, value: passwordHash },
        full_name: { type: tedious.TYPES.NVarChar, value: fullName },
        tenant_name: { type: tedious.TYPES.NVarChar, value: tenantName },
        tenant_slug: { type: tedious.TYPES.NVarChar, value: slug },
      }
    );
    const row = rows && rows[0];
    return {
      success: true,
      user_id: row ? row.user_id : null,
      tenant_id: row ? row.tenant_id : null,
      branch_id: row ? row.branch_id : null,
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('sql-hash-password', async (_, password) => {
  try {
    const bcrypt = getBcrypt();
    if (!bcrypt) return { success: false, error: 'bcryptjs yuklenemedi' };
    const hash = await bcrypt.hash(password, 10);
    return { success: true, hash };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('local-db-login', async (_, { email, password }) => {
  try {
    const record = await localDbLogin({ email, password });
    return { success: true, data: record };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('local-db-register', async (_, { email, password, fullName, tenantName }) => {
  try {
    const result = await localDbCreateTenantAndUser({ email, password, fullName, tenantName });
    const record = await localDbLogin({ email, password });
    return { success: true, data: record, ...result };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('local-db-add-user', async (_, { email, password, fullName, tenantId, branchId, roleId, role }) => {
  try {
    const result = await localDbAddUser({ email, password, fullName, tenantId, branchId, roleId, role });
    return { success: true, ...result };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('local-db-change-password', async (_, { userId, newPassword }) => {
  try {
    await localDbChangePassword(userId, newPassword);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('local-db-get-users', (_, { tenantId }) => {
  try {
    const users = localDbGetUsers(tenantId);
    return { success: true, data: users };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('local-db-get-roles', (_, { tenantId }) => {
  try {
    return { success: true, data: localDbGetRoles(tenantId) };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('local-db-get-branches', (_, { tenantId }) => {
  try {
    return { success: true, data: localDbGetBranches(tenantId) };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('local-db-update-profile', (_, { profileId, updates }) => {
  try {
    localDbUpdateProfile(profileId, updates);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('local-db-get-terminal-users', (_, { tenantId } = {}) => {
  try {
    return { success: true, data: localDbGetTerminalUsers(tenantId) };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('local-db-is-empty', () => {
  try {
    return { success: true, empty: localDbIsEmpty() };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('local-db-read', (_, { table, tenantId }) => {
  try {
    const db = localDbEnsureDefaults(loadLocalDb());
    let rows = db[table] || [];
    if (tenantId) rows = rows.filter(r => r.tenant_id === tenantId || !r.tenant_id);
    return { success: true, data: rows };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('local-db-write', (_, { table, row }) => {
  try {
    const db = localDbEnsureDefaults(loadLocalDb());
    if (!db[table]) db[table] = [];
    const idx = db[table].findIndex(r => r.id === row.id);
    if (idx >= 0) db[table][idx] = { ...db[table][idx], ...row };
    else db[table].push({ ...row, id: row.id || require('crypto').randomUUID(), created_at: row.created_at || new Date().toISOString() });
    saveLocalDb(db);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('local-db-delete', (_, { table, id }) => {
  try {
    const db = localDbEnsureDefaults(loadLocalDb());
    if (db[table]) db[table] = db[table].filter(r => r.id !== id);
    saveLocalDb(db);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('sql-find-profile-by-username', async (_, username) => {
  try {
    const tedious = getTedious();
    if (!tedious) return { success: false, error: 'tedious paketi yuklenemedi' };
    const sanitized = (username || '').trim().toLowerCase();
    const rows = await runSql(
      `SELECT TOP 1 u.email FROM app_users u LEFT JOIN profiles p ON p.id = u.id
       WHERE u.email = @exact OR u.email LIKE @pattern1 OR u.email LIKE @pattern2 OR LOWER(p.full_name) = @sanitized
       ORDER BY u.created_at`,
      {
        exact: { type: tedious.TYPES.NVarChar, value: sanitized + '@shefpos.local' },
        pattern1: { type: tedious.TYPES.NVarChar, value: sanitized + '@%.shefpos.local' },
        pattern2: { type: tedious.TYPES.NVarChar, value: sanitized + '@%' },
        sanitized: { type: tedious.TYPES.NVarChar, value: sanitized },
      }
    );
    const row = rows && rows[0];
    return { success: true, email: row ? row.email : null };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('sql-query', async (_, { table, operation, select, filters, orderBy, limitVal, data }) => {
  try {
    if (!getTedious()) return { data: null, error: 'tedious paketi yuklenemedi' };
    const safeIdentifier = (c) => c.replace(/[^a-zA-Z0-9_]/g, '');
    const safeSelectCols = (s) => {
      if (!s || s === '*') return '*';
      return s.split(',').map(col => {
        const trimmed = col.trim();
        if (trimmed === '*') return '*';
        return safeIdentifier(trimmed);
      }).filter(Boolean).join(', ') || '*';
    };
    const settings = loadSettings();
    const cfg = settings.sqlServerConfig;
    if (!cfg) return { data: null, error: 'SQL Server yapılandırması bulunamadı' };

    if (operation === 'select') {
      const hasJoin = select && /\w+\s*\(/.test(select);
      if (hasJoin) {
        const rows = await execSelectWithJoins(table, select, filters, orderBy, limitVal, cfg);
        return { data: rows, error: null };
      }
      const params = {};
      const where = buildWhereTedious(filters, params, 'w');
      const cols = safeSelectCols(select);
      const order = orderBy && orderBy.length > 0
        ? `ORDER BY ${orderBy.map(o => `${safeIdentifier(o.col)} ${o.asc ? 'ASC' : 'DESC'}`).join(', ')}`
        : '';
      const top = limitVal ? `TOP ${parseInt(limitVal, 10)}` : '';
      const parts = ['SELECT', top, cols, 'FROM', safeIdentifier(table), where, order].filter(Boolean);
      const q = parts.join(' ').trim();
      const rows = await runSql(q, params, cfg);
      return { data: rows, error: null };
    }

    if (operation === 'insert') {
      const rowArr = Array.isArray(data) ? data : [data];
      const results = [];
      for (const row of rowArr) {
        const params = {};
        const filteredRow = {};
        for (const [k, v] of Object.entries(row)) { if (v !== undefined) filteredRow[k] = v; }
        if (!filteredRow.id) filteredRow.id = require('crypto').randomUUID();
        const keys = Object.keys(filteredRow);
        keys.forEach((k, i) => addTediousParam(params, `i${i}`, filteredRow[k]));
        const colList = keys.map(k => safeIdentifier(k)).join(', ');
        const valList = keys.map((_, i) => `@i${i}`).join(', ');
        const q = `INSERT INTO ${safeIdentifier(table)} (${colList}) OUTPUT INSERTED.* VALUES (${valList})`;
        const rows = await runSql(q, params, cfg);
        if (rows && rows[0]) results.push(rows[0]);
      }
      return { data: rowArr.length === 1 ? results[0] || null : results, error: null };
    }

    if (operation === 'update') {
      const params = {};
      const entries = Object.entries(data).filter(([, v]) => v !== undefined);
      entries.forEach(([k, v], i) => addTediousParam(params, `u${i}`, v));
      const setClauses = entries.map(([k], i) => `${safeIdentifier(k)} = @u${i}`).join(', ');
      if (!setClauses) return { data: [], error: null };
      const where = buildWhereTedious(filters, params, 'w');
      const q = `UPDATE ${safeIdentifier(table)} SET ${setClauses} OUTPUT INSERTED.* ${where}`.trim();
      const rows = await runSql(q, params, cfg);
      return { data: rows || [], error: null };
    }

    if (operation === 'delete') {
      const params = {};
      const where = buildWhereTedious(filters, params, 'w');
      const q = `DELETE FROM ${safeIdentifier(table)} OUTPUT DELETED.* ${where}`.trim();
      const rows = await runSql(q, params, cfg);
      return { data: rows || [], error: null };
    }

    if (operation === 'upsert') {
      const rowArr = Array.isArray(data) ? data : [data];
      const results = [];
      for (const row of rowArr) {
        if (!row.id) row.id = require('crypto').randomUUID();
        const params = {};
        const keys = Object.keys(row);
        keys.forEach((k, i) => addTediousParam(params, `p${i}`, row[k]));
        const colList = keys.map(k => safeIdentifier(k)).join(', ');
        const valList = keys.map((_, i) => `@p${i}`).join(', ');
        const idIdx = keys.indexOf('id');
        const updateSet = keys.filter(k => k !== 'id').map((k) => `${safeIdentifier(k)} = @p${keys.indexOf(k)}`).join(', ');
        const q = `
          IF EXISTS (SELECT 1 FROM ${safeIdentifier(table)} WHERE id = @p${idIdx})
            UPDATE ${safeIdentifier(table)} SET ${updateSet} OUTPUT INSERTED.* WHERE id = @p${idIdx}
          ELSE
            INSERT INTO ${safeIdentifier(table)} (${colList}) OUTPUT INSERTED.* VALUES (${valList})
        `;
        const rows = await runSql(q, params, cfg);
        if (rows && rows[0]) results.push(rows[0]);
      }
      return { data: rowArr.length === 1 ? results[0] || null : results, error: null };
    }

    return { data: null, error: 'Bilinmeyen operasyon: ' + operation };
  } catch (err) {
    return { data: null, error: err.message };
  }
});

ipcMain.handle('sql-get-terminal-users', async () => {
  try {
    const tedious = getTedious();
    if (!tedious) return { data: null, error: 'tedious paketi yuklenemedi' };
    const query = `SELECT id, full_name, username, role, branch_id FROM profiles WHERE is_active = 1 ORDER BY full_name ASC`;
    const rows = await runSql(query, {});
    return { data: rows, error: null };
  } catch (err) {
    return { data: null, error: err.message };
  }
});

ipcMain.handle('sql-get-branches', async (_, { tenantId, userId, userRole }) => {
  try {
    const tedious = getTedious();
    if (!tedious) return { data: null, error: 'tedious paketi yuklenemedi' };
    const isAdmin = userRole === 'owner' || userRole === 'admin';
    let query;
    let params;
    if (isAdmin) {
      query = `SELECT * FROM branches WHERE tenant_id = @tenantId AND is_active = 1 ORDER BY is_main DESC, name ASC`;
      params = { tenantId: { type: tedious.TYPES.NVarChar, value: tenantId } };
    } else {
      query = `SELECT b.* FROM branches b INNER JOIN profiles p ON p.branch_id = b.id WHERE b.tenant_id = @tenantId AND b.is_active = 1 AND p.id = @userId ORDER BY b.is_main DESC, b.name ASC`;
      params = {
        tenantId: { type: tedious.TYPES.NVarChar, value: tenantId },
        userId: { type: tedious.TYPES.NVarChar, value: userId },
      };
    }
    const rows = await runSql(query, params);
    return { data: rows, error: null };
  } catch (err) {
    return { data: null, error: err.message };
  }
});

ipcMain.handle('check-for-updates', async () => {
  if (!autoUpdater || process.env.NODE_ENV === 'development') {
    return { error: 'Güncelleme sadece production modunda çalışır' };
  }
  try {
    const result = await autoUpdater.checkForUpdates();
    return { version: result?.updateInfo?.version || null };
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle('install-update', () => {
  if (autoUpdater) {
    autoUpdater.quitAndInstall(false, true);
  }
});

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('get-ip-address', async () => {
  const os = require('os');
  const interfaces = os.networkInterfaces();

  // Prefer IPv4 addresses
  for (const name of Object.keys(interfaces)) {
    const ifaces = interfaces[name];
    for (const iface of ifaces || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'unknown';
});

ipcMain.handle('get-device-fingerprint', async () => {
  const os = require('os');
  const crypto = require('crypto');
  const fs = require('fs');
  const path = require('path');

  // Try to get MAC address (most reliable)
  const interfaces = os.networkInterfaces();
  let macAddress = '';
  for (const name of Object.keys(interfaces)) {
    const ifaces = interfaces[name];
    for (const iface of ifaces || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        macAddress = iface.mac;
        break;
      }
    }
    if (macAddress) break;
  }

  // Combine with hostname for unique fingerprint
  const hostname = os.hostname();
  const combined = `${hostname}:${macAddress}`;
  const hash = crypto.createHash('sha256').update(combined).digest('hex');

  return hash;
});

app.whenReady().then(() => {
  startPrintAgent();
  createWindow();
  setupAutoUpdater();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

let scaleComPort = null;
let scaleWeighingSession = null;
const scaleBuffer = { data: '', lastUpdate: 0 };

ipcMain.handle('scale-list-ports', async () => {
  try {
    if (process.platform !== 'win32') return [];
    const ports = [];
    for (let i = 1; i <= 9; i++) {
      ports.push({ path: `COM${i}`, name: `COM${i}` });
    }
    return ports;
  } catch {
    return [];
  }
});

ipcMain.handle('scale-start-weighing', (_, { port, baudRate = 9600 }) => {
  try {
    if (scaleWeighingSession) return { error: 'Weighing in progress' };

    let SerialPort;
    try {
      SerialPort = require('serialport').SerialPort;
    } catch {
      return { error: 'SerialPort module required: npm install serialport' };
    }

    const scalePort = new SerialPort({
      path: port,
      baudRate,
      dataBits: 8,
      parity: 'none',
      stopBits: 1
    });
    scaleBuffer.data = '';
    scaleBuffer.lastUpdate = 0;

    scaleWeighingSession = {
      port: scalePort,
      startTime: Date.now(),
      lastWeight: null,
      stabilized: false,
      history: []
    };

    let lastStableTime = 0;

    scalePort.on('data', (data) => {
      const str = data.toString();
      scaleBuffer.data += str;
      scaleBuffer.lastUpdate = Date.now();

      let value = null;
      let kgMatch = scaleBuffer.data.match(/(\d+[.,]\d+|\d+)\s*kg/i);
      if (kgMatch) {
        value = parseFloat(kgMatch[1].replace(',', '.')) * 1000;
      } else {
        let gMatch = scaleBuffer.data.match(/(\d+[.,]\d+|\d+)\s*g(?!r)/i) || scaleBuffer.data.match(/(\d+[.,]\d+|\d+)/);
        if (gMatch) {
          value = parseFloat(gMatch[1].replace(',', '.'));
        }
      }

      if (value !== null && !isNaN(value) && value >= 0 && value <= 50000) {
        scaleWeighingSession.history.push({ value, time: Date.now() });
        if (scaleWeighingSession.history.length > 3) {
          scaleWeighingSession.history.shift();
        }

        const avgValue = scaleWeighingSession.history.reduce((a, b) => a + b.value, 0) / scaleWeighingSession.history.length;
        scaleWeighingSession.lastWeight = avgValue;
        scaleBuffer.data = '';

        // Stabilize after 1 second of stable readings
        const now = Date.now();
        if (scaleWeighingSession.history.every(h => Math.abs(h.value - avgValue) < 10)) {
          if (now - lastStableTime > 1000) {
            scaleWeighingSession.stabilized = true;
          }
        } else {
          lastStableTime = now;
          scaleWeighingSession.stabilized = false;
        }

        mainWindow?.webContents.send('scale-weight-update', {
          weight: avgValue,
          stabilized: scaleWeighingSession.stabilized,
          timestamp: Date.now()
        });

        // Clear after newline
        if (scaleBuffer.data.includes('\n')) {
          scaleBuffer.data = '';
        }
      }
    });

    scalePort.on('error', (err) => {
      console.error('Scale port error:', err);
      mainWindow?.webContents.send('scale-weighing-error', { error: err.message });
      if (scaleWeighingSession?.port) {
        try { scaleWeighingSession.port.close(); } catch {}
      }
      scaleWeighingSession = null;
    });

    return { success: true, port, sessionId: Date.now() };
  } catch (err) {
    scaleWeighingSession = null;
    return { error: err.message };
  }
});

ipcMain.handle('scale-stop-weighing', () => {
  try {
    if (scaleWeighingSession?.port) {
      scaleWeighingSession.port.close();
    }
    const result = scaleWeighingSession?.lastWeight || null;
    scaleWeighingSession = null;
    return { success: true, weight: result };
  } catch (err) {
    scaleWeighingSession = null;
    return { error: err.message };
  }
});

ipcMain.handle('scale-get-weight', () => {
  if (!scaleWeighingSession) return { error: 'No weighing session' };
  return {
    weight: scaleWeighingSession.lastWeight,
    stabilized: scaleWeighingSession.stabilized,
    history: scaleWeighingSession.history.slice(-5)
  };
});

app.on('window-all-closed', () => {
  if (realtimeReconnectTimer) clearTimeout(realtimeReconnectTimer);
  if (realtimeWs) { try { realtimeWs.close(); } catch {} }
  if (printAgentServer) {
    printAgentServer.close();
  }
  if (scaleComPort) {
    try { scaleComPort.close(); } catch {}
  }
  closeSqlPool();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
