import { isHybridMode, isHybridCloudLinked } from './hybridMode';

const eApi = () => (window as any).electronAPI;

export function isVdsSelfHost(): boolean {
  return import.meta.env.VITE_VDS_SELFHOST === 'true';
}

/** Uzak VDS API kökü (Cloudflare www / Electron cloud). Boş = same-origin `/vds-api`. */
export const DEFAULT_REMOTE_VDS_ORIGIN = 'https://sefpos.com.tr';

function isSefposWebHost(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    const h = String(window.location.hostname || '')
      .trim()
      .toLowerCase()
      .replace(/^www\./, '');
    return h === 'sefpos.com.tr';
  } catch {
    return false;
  }
}

export function getVdsApiOrigin(): string {
  // VDS self-host ve canlı sefpos.com.tr / www → her zaman same-origin.
  // Aksi halde VITE_VDS_API_BASE=apex iken www'de CSP connect-src 'self' login'i keser.
  if (isVdsSelfHost() || isSefposWebHost()) return '';

  const fromEnv = String(import.meta.env.VITE_VDS_API_BASE || '')
    .trim()
    .replace(/\/$/, '');
  if (fromEnv) return fromEnv;
  try {
    // Electron "cloud" artık Supabase değil — VDS
    if (eApi()?.isElectron && localStorage.getItem('dbMode') === 'cloud') {
      return DEFAULT_REMOTE_VDS_ORIGIN;
    }
  } catch {
    /* ignore */
  }
  return '';
}

/** VDS SQL API kullanılsın mı (self-host, canlı domain veya uzak). */
export function isVdsBackend(): boolean {
  if (isVdsSelfHost()) return true;
  // Yanlışlıkla build:vds olmadan deploy edilse bile sefpos.com.tr → VDS
  if (isSefposWebHost()) return true;
  if (String(import.meta.env.VITE_VDS_API_BASE || '').trim()) return true;
  try {
    if (eApi()?.isElectron && localStorage.getItem('dbMode') === 'cloud') return true;
  } catch {
    /* ignore */
  }
  return false;
}

if (
  typeof window !== 'undefined' &&
  (isVdsSelfHost() || isSefposWebHost() || String(import.meta.env.VITE_VDS_API_BASE || '').trim())
) {
  try {
    localStorage.setItem('dbMode', 'sqlserver');
  } catch {
    /* ignore */
  }
}

function isCloudLoginEmail(email: string): boolean {
  const em = String(email || '').trim().toLowerCase();
  return (
    em.includes('@') &&
    !em.endsWith('@shefpos.local') &&
    !em.endsWith('@local.shefpos')
  );
}

export function isSqlServerMode(): boolean {
  if (isVdsBackend()) return true;
  if (!(eApi()?.isElectron)) return false;
  try {
    const saved = localStorage.getItem('dbMode');
    return saved === 'sqlserver' || saved === 'postgres' || saved === 'hybrid';
  } catch {
    /* ignore */
  }
  return false;
}

const SQL_SESSION_KEY = 'shefpos_sql_session';

/** Electron ayar dosyasindan gelen modu localStorage ile hizalar (giris ekrani icin). */
export function persistElectronDbMode(mode: string | null | undefined): void {
  if (!mode) return;
  const normalized = mode === 'postgres' ? 'sqlserver' : mode;
  try {
    localStorage.setItem('dbMode', normalized);
  } catch {
    /* ignore */
  }
}

export function isElectronCloudMode(): boolean {
  if (!(eApi()?.isElectron)) return false;
  try {
    return localStorage.getItem('dbMode') === 'cloud';
  } catch {
    return false;
  }
}

/** Ana süreçteki dbMode ile localStorage'ı eşitle (eski hybrid kalıntısını önler). */
export async function syncElectronDbModeFromMain(): Promise<
  'cloud' | 'sqlserver' | 'hybrid' | 'local' | null
> {
  const api = eApi();
  if (!api?.getDbMode) return null;
  try {
    const mode = await api.getDbMode();
    if (!mode) return null;
    const normalized = mode === 'postgres' ? 'sqlserver' : mode;
    persistElectronDbMode(normalized);
    return normalized as 'cloud' | 'sqlserver' | 'hybrid' | 'local';
  } catch {
    return null;
  }
}

export function isLocalMode(): boolean {
  if (isVdsSelfHost()) return false;
  return !!(eApi()?.isElectron) && localStorage.getItem('dbMode') === 'local';
}

export function isOfflineMode(): boolean {
  return isSqlServerMode() || isLocalMode();
}

type FilterOp = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'is_null' | 'is_not_null' | 'like' | 'ilike' | 'in' | 'not_in' | 'or';

/** PostgREST `.or('col.op.val,col2.op2.val2')` — ilike/like dahil (eski kod hepsini eq yapıyordu). */
function parsePostgrestFilter(part: string): { col: string; op: FilterOp; val?: any } {
  const p = String(part || '').trim();
  const dotIdx = p.indexOf('.');
  if (dotIdx < 0) return { col: p, op: 'eq' };
  const col = p.substring(0, dotIdx);
  const rest = p.substring(dotIdx + 1);
  const opEnd = rest.indexOf('.');
  const opRaw = opEnd >= 0 ? rest.substring(0, opEnd) : rest;
  const val = opEnd >= 0 ? rest.substring(opEnd + 1) : undefined;
  if (opRaw === 'is' && (val === 'null' || val === undefined)) return { col, op: 'is_null' };
  if (opRaw === 'is' && val === 'not_null') return { col, op: 'is_not_null' };
  const known: FilterOp[] = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'in', 'not_in'];
  if (known.includes(opRaw as FilterOp)) {
    return { col, op: opRaw as FilterOp, val };
  }
  return { col, op: 'eq', val: rest };
}

interface Filter {
  col: string;
  op: FilterOp;
  val?: any;
}

interface OrderClause {
  col: string;
  asc: boolean;
}

type Operation = 'select' | 'insert' | 'update' | 'delete' | 'upsert';

interface QueryState {
  table: string;
  operation: Operation;
  select?: string;
  filters: Filter[];
  orderBy: OrderClause[];
  limitVal?: number;
  data?: any;
  upsertOn?: string[];
  countOnly?: boolean;
  headOnly?: boolean;
}

function vdsAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  try {
    const raw = localStorage.getItem(SQL_SESSION_KEY);
    const session = raw ? JSON.parse(raw) : null;
    const token = session?.access_token;
    if (token) headers.Authorization = `Bearer ${token}`;
  } catch {
    /* ignore */
  }
  return headers;
}

function vdsApiUrl(path: string): string {
  const origin = getVdsApiOrigin();
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${origin}/vds-api${p}`;
}

async function vdsPost<T = any>(path: string, body: unknown): Promise<T> {
  const origin = getVdsApiOrigin();
  const res = await fetch(vdsApiUrl(path), {
    method: 'POST',
    headers: vdsAuthHeaders(),
    body: JSON.stringify(body),
    credentials: origin ? 'omit' : 'same-origin',
  });
  const json = (await res.json().catch(() => null)) as T & { error?: string };
  if (!res.ok) {
    throw new Error((json as any)?.error || `VDS API ${res.status}`);
  }
  return json;
}

async function execQuery(
  state: QueryState,
): Promise<{ data: any; error: any; count?: number | null }> {
  if (isVdsBackend()) {
    try {
      const result = await vdsPost<{ data: any; error?: string; count?: number | null }>('/query', state);
      if (result.error) return { data: null, error: new Error(result.error) };
      return { data: result.data, error: null, count: result.count ?? null };
    } catch (err: any) {
      return { data: null, error: err };
    }
  }
  const api = eApi();
  if (!api) return { data: null, error: new Error('Electron API bulunamadi') };
  try {
    const result = await api.sqlQuery(state);
    if (result.error) return { data: null, error: new Error(result.error) };
    return { data: result.data, error: null, count: result.count ?? null };
  } catch (err: any) {
    return { data: null, error: err };
  }
}

class SqlQueryBuilder {
  private state: QueryState;

  constructor(table: string) {
    this.state = {
      table,
      operation: 'select',
      select: '*',
      filters: [],
      orderBy: [],
    };
  }

  select(cols: string, opts?: { count?: string; head?: boolean }) {
    this.state.select = cols;
    if (opts?.count === 'exact') {
      this.state.countOnly = true;
      this.state.headOnly = !!opts.head;
    }
    return this;
  }

  eq(col: string, val: any) { this.state.filters.push({ col, op: 'eq', val }); return this; }
  neq(col: string, val: any) { this.state.filters.push({ col, op: 'neq', val }); return this; }
  gt(col: string, val: any) { this.state.filters.push({ col, op: 'gt', val }); return this; }
  gte(col: string, val: any) { this.state.filters.push({ col, op: 'gte', val }); return this; }
  lt(col: string, val: any) { this.state.filters.push({ col, op: 'lt', val }); return this; }
  lte(col: string, val: any) { this.state.filters.push({ col, op: 'lte', val }); return this; }

  is(col: string, val: null | 'null') {
    this.state.filters.push({ col, op: 'is_null' });
    return this;
  }

  not(col: string, op: string, val: any) {
    if (op === 'is' && (val === null || val === 'null')) {
      this.state.filters.push({ col, op: 'is_not_null' });
      return this;
    }
    if (op === 'in') {
      const vals = Array.isArray(val)
        ? val
        : String(val ?? '')
            .replace(/^\(|\)$/g, '')
            .split(',')
            .map((x) => x.trim())
            .filter(Boolean);
      this.state.filters.push({ col, op: 'not_in', val: vals });
      return this;
    }
    this.state.filters.push({ col, op: 'neq', val });
    return this;
  }

  in(col: string, vals: any[]) {
    this.state.filters.push({ col, op: 'in', val: vals });
    return this;
  }

  ilike(col: string, pattern: string) {
    this.state.filters.push({ col, op: 'ilike', val: pattern });
    return this;
  }

  like(col: string, pattern: string) {
    this.state.filters.push({ col, op: 'like', val: pattern });
    return this;
  }

  or(expr: string) {
    const parts = expr.split(',').map((p) => p.trim()).filter(Boolean);
    const orFilters = parts.map((p) => parsePostgrestFilter(p));
    this.state.filters.push({ col: '', op: 'or', val: orFilters });
    return this;
  }

  order(col: string, opts?: { ascending?: boolean }) {
    this.state.orderBy.push({ col, asc: opts?.ascending !== false });
    return this;
  }

  limit(n: number) {
    this.state.limitVal = n;
    return this;
  }

  insert(data: any) {
    this.state.operation = 'insert';
    this.state.data = data;
    return this;
  }

  update(data: any) {
    this.state.operation = 'update';
    this.state.data = data;
    return this;
  }

  delete() {
    this.state.operation = 'delete';
    return this;
  }

  upsert(data: any, opts?: { onConflict?: string }) {
    this.state.operation = 'upsert';
    this.state.data = data;
    if (opts?.onConflict) this.state.upsertOn = opts.onConflict.split(',');
    return this;
  }

  then(resolve: (val: any) => any, reject?: (err: any) => any): Promise<any> {
    return execQuery(this.state).then(
      (res) => resolve({ data: res.data, error: res.error, count: res.count }),
      reject,
    );
  }

  async single(): Promise<{ data: any; error: any }> {
    const { data, error } = await execQuery(this.state);
    if (error) return { data: null, error };
    const arr = Array.isArray(data) ? data : (data ? [data] : []);
    return { data: arr[0] || null, error: null };
  }

  async maybeSingle(): Promise<{ data: any; error: any }> {
    return this.single();
  }
}

type AuthStateEvent = 'SIGNED_IN' | 'SIGNED_OUT' | 'INITIAL_SESSION';
type AuthCallback = (event: AuthStateEvent, session: any) => void;

const authCallbacks: AuthCallback[] = [];

function getSqlSession() {
  try {
    const raw = localStorage.getItem(SQL_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function setSqlSession(session: any) {
  if (session) {
    localStorage.setItem(SQL_SESSION_KEY, JSON.stringify(session));
  } else {
    localStorage.removeItem(SQL_SESSION_KEY);
  }
  authCallbacks.forEach(cb => cb(session ? 'SIGNED_IN' : 'SIGNED_OUT', session));
}

/** SQL bit / 0-1 / true-false tek tip boolean */
export function sqlTruth(v: unknown): boolean {
  return v === true || v === 1 || v === '1' || v === 'true';
}

/** VDS/SQL oturum kaydındaki alanları güncelle (onboarding vb.) */
export function patchSqlSessionRecord(patch: Record<string, unknown>): void {
  try {
    const session = getSqlSession();
    if (!session) return;
    session._sqlRecord = { ...(session._sqlRecord || {}), ...patch };
    localStorage.setItem(SQL_SESSION_KEY, JSON.stringify(session));
  } catch {
    /* ignore */
  }
}

function buildUserFromRecord(record: any) {
  return {
    id: record.user_id,
    email: record.email,
    app_metadata: {},
    user_metadata: { full_name: record.full_name },
    aud: 'authenticated',
    created_at: new Date().toISOString(),
  };
}

function buildSessionFromRecord(record: any) {
  const user = buildUserFromRecord(record);
  return {
    access_token: `sqlserver-${record.user_id}`,
    refresh_token: null,
    expires_in: 86400,
    token_type: 'bearer',
    user,
    _sqlRecord: record,
  };
}

const noopChannel = {
  on: () => noopChannel,
  subscribe: (cb?: (status: string) => void) => {
    if (cb) setTimeout(() => cb('SUBSCRIBED'), 50);
    return noopChannel;
  },
  unsubscribe: () => Promise.resolve(),
  send: () => noopChannel,
};

function genUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

type LocalFilterOp = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'is_null' | 'is_not_null' | 'like' | 'ilike' | 'in' | 'not_in' | 'or';
interface LocalFilter { col: string; op: LocalFilterOp; val?: any; }

function applyLocalFilters(rows: any[], filters: LocalFilter[]): any[] {
  return rows.filter(row => filters.every(f => {
    const val = row[f.col];
    if (f.op === 'eq') return val == f.val || String(val ?? '') === String(f.val ?? '');
    if (f.op === 'neq') return val != f.val;
    if (f.op === 'gt') return val > f.val;
    if (f.op === 'gte') return val >= f.val;
    if (f.op === 'lt') return val < f.val;
    if (f.op === 'lte') return val <= f.val;
    if (f.op === 'is_null') return val === null || val === undefined;
    if (f.op === 'is_not_null') return val !== null && val !== undefined;
    if (f.op === 'like' || f.op === 'ilike') {
      const pat = (f.val || '').replace(/%/g, '.*').replace(/_/g, '.');
      return new RegExp(pat, f.op === 'ilike' ? 'i' : '').test(String(val || ''));
    }
    if (f.op === 'in') return Array.isArray(f.val) && f.val.map(String).includes(String(val));
    if (f.op === 'not_in') return Array.isArray(f.val) && !f.val.map(String).includes(String(val));
    if (f.op === 'or') return (f.val as LocalFilter[]).some(sub => applyLocalFilters([row], [sub]).length > 0);
    return true;
  }));
}

class LocalQueryBuilder {
  private table: string;
  private _select: string = '*';
  private filters: LocalFilter[] = [];
  private _order: { col: string; asc: boolean }[] = [];
  private _limit?: number;
  private _data?: any;
  private _op: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select';
  private _onConflict?: string;

  constructor(table: string) { this.table = table; }

  select(cols: string) { this._select = cols; return this; }
  eq(col: string, val: any) { this.filters.push({ col, op: 'eq', val }); return this; }
  neq(col: string, val: any) { this.filters.push({ col, op: 'neq', val }); return this; }
  gt(col: string, val: any) { this.filters.push({ col, op: 'gt', val }); return this; }
  gte(col: string, val: any) { this.filters.push({ col, op: 'gte', val }); return this; }
  lt(col: string, val: any) { this.filters.push({ col, op: 'lt', val }); return this; }
  lte(col: string, val: any) { this.filters.push({ col, op: 'lte', val }); return this; }
  is(col: string, _val: null | 'null') { this.filters.push({ col, op: 'is_null' }); return this; }
  not(col: string, op: string, val: any) {
    if (op === 'is' && (val === null || val === 'null')) this.filters.push({ col, op: 'is_not_null' });
    else this.filters.push({ col, op: 'neq', val });
    return this;
  }
  in(col: string, vals: any[]) { this.filters.push({ col, op: 'in', val: vals }); return this; }
  ilike(col: string, pattern: string) { this.filters.push({ col, op: 'ilike', val: pattern }); return this; }
  like(col: string, pattern: string) { this.filters.push({ col, op: 'like', val: pattern }); return this; }
  or(expr: string) {
    const parts = expr.split(',').map((p) => p.trim()).filter(Boolean);
    const orFilters: LocalFilter[] = parts.map((p) => {
      const f = parsePostgrestFilter(p);
      return { col: f.col, op: f.op as LocalFilterOp, val: f.val };
    });
    this.filters.push({ col: '', op: 'or', val: orFilters });
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this._order.push({ col, asc: opts?.ascending !== false });
    return this;
  }
  limit(n: number) { this._limit = n; return this; }
  insert(data: any) { this._op = 'insert'; this._data = data; return this; }
  update(data: any) { this._op = 'update'; this._data = data; return this; }
  delete() { this._op = 'delete'; return this; }
  upsert(data: any, opts?: { onConflict?: string }) {
    this._op = 'upsert'; this._data = data;
    if (opts?.onConflict) this._onConflict = opts.onConflict;
    return this;
  }

  private async _exec(): Promise<{ data: any; error: any }> {
    const api = eApi();
    if (!api) return { data: null, error: new Error('Electron API bulunamadi') };

    if (this._op === 'select') {
      const result = await api.localDbRead({ table: this.table });
      if (!result.success) return { data: null, error: new Error(result.error) };
      let rows: any[] = result.data || [];

      const orFilters = this.filters.filter(f => f.op === 'or');
      const nonOrFilters = this.filters.filter(f => f.op !== 'or');
      rows = applyLocalFilters(rows, nonOrFilters);
      if (orFilters.length > 0) rows = applyLocalFilters(rows, orFilters);

      for (const ord of this._order) {
        rows.sort((a, b) => {
          const av = a[ord.col]; const bv = b[ord.col];
          if (av == null && bv == null) return 0;
          if (av == null) return ord.asc ? 1 : -1;
          if (bv == null) return ord.asc ? -1 : 1;
          return ord.asc ? (av > bv ? 1 : av < bv ? -1 : 0) : (av < bv ? 1 : av > bv ? -1 : 0);
        });
      }
      if (this._limit) rows = rows.slice(0, this._limit);
      return { data: rows, error: null };
    }

    if (this._op === 'insert') {
      const arr = Array.isArray(this._data) ? this._data : [this._data];
      const results = [];
      for (const row of arr) {
        const newRow = { ...row, id: row.id || genUUID(), created_at: row.created_at || new Date().toISOString(), updated_at: new Date().toISOString() };
        const r = await api.localDbWrite({ table: this.table, row: newRow });
        if (!r.success) return { data: null, error: new Error(r.error) };
        results.push(newRow);
      }
      return { data: arr.length === 1 ? results[0] : results, error: null };
    }

    if (this._op === 'update') {
      const result = await api.localDbRead({ table: this.table });
      if (!result.success) return { data: null, error: new Error(result.error) };
      let rows: any[] = applyLocalFilters(result.data || [], this.filters);
      const updated = [];
      for (const row of rows) {
        const newRow = { ...row, ...this._data, updated_at: new Date().toISOString() };
        await api.localDbWrite({ table: this.table, row: newRow });
        updated.push(newRow);
      }
      return { data: updated, error: null };
    }

    if (this._op === 'delete') {
      const result = await api.localDbRead({ table: this.table });
      if (!result.success) return { data: null, error: new Error(result.error) };
      const rows: any[] = applyLocalFilters(result.data || [], this.filters);
      for (const row of rows) {
        await api.localDbDelete({ table: this.table, id: row.id });
      }
      return { data: rows, error: null };
    }

    if (this._op === 'upsert') {
      const arr = Array.isArray(this._data) ? this._data : [this._data];
      const results = [];
      for (const item of arr) {
        const row = { ...item, id: item.id || genUUID(), updated_at: new Date().toISOString() };
        if (!row.created_at) row.created_at = new Date().toISOString();
        await api.localDbWrite({ table: this.table, row });
        results.push(row);
      }
      return { data: arr.length === 1 ? results[0] : results, error: null };
    }

    return { data: null, error: new Error('Unknown operation') };
  }

  then(resolve: (val: any) => any, reject?: (err: any) => any): Promise<any> {
    return this._exec().then(resolve, reject);
  }

  async single(): Promise<{ data: any; error: any }> {
    const { data, error } = await this._exec();
    if (error) return { data: null, error };
    const arr = Array.isArray(data) ? data : (data ? [data] : []);
    return { data: arr[0] || null, error: null };
  }

  async maybeSingle(): Promise<{ data: any; error: any }> {
    return this.single();
  }
}

export const localDb = {
  from(table: string) {
    return new LocalQueryBuilder(table);
  },

  async rpc(fn: string, _params?: Record<string, unknown>) {
    if (fn === 'get_current_business_date') {
      const d = new Date().toISOString().slice(0, 10);
      return {
        data: [{ business_date: d, mode: 'cutoff', cutoff_hour: 6, last_closed: null, hours_open: null }],
        error: null,
      };
    }
    if (fn === 'unlock_stale_payment_locks') {
      return { data: null, error: null };
    }
    return { data: null, error: new Error(`RPC ${fn} yerel modda desteklenmiyor`) };
  },

  channel(_name: string) {
    return noopChannel;
  },

  removeChannel(_ch: any) {},

  auth: {
    async getSession() {
      const session = getSqlSession();
      return { data: { session } };
    },

    onAuthStateChange(cb: (event: any, session: any) => void) {
      authCallbacks.push(cb as any);
      const session = getSqlSession();
      if (session) {
        setTimeout(() => cb('INITIAL_SESSION', session), 0);
      } else {
        setTimeout(() => cb('SIGNED_OUT', null), 0);
      }
      return {
        data: {
          subscription: {
            unsubscribe() {
              const idx = authCallbacks.indexOf(cb as any);
              if (idx >= 0) authCallbacks.splice(idx, 1);
            },
          },
        },
      };
    },

    async signInWithPassword({ email, password }: { email: string; password: string }) {
      const api = eApi();
      if (!api) return { data: null, error: new Error('Electron API bulunamadi') };
      const result = await api.localDbLogin({ email, password });
      if (!result.success) return { data: null, error: new Error(result.error || 'Giris basarisiz') };
      const session = buildSessionFromRecord(result.data);
      setSqlSession(session);
      return { data: { session, user: session.user }, error: null };
    },

    async signUp({ email, password, options }: { email: string; password: string; options?: any }) {
      const api = eApi();
      if (!api) return { data: null, error: new Error('Electron API bulunamadi') };
      const fullName = options?.data?.full_name || '';
      const tenantName = options?.data?.tenant_name || '';
      const result = await api.localDbRegister({ email, password, fullName, tenantName });
      if (!result.success) return { data: null, error: new Error(result.error || 'Kayit basarisiz') };
      const session = buildSessionFromRecord(result.data);
      setSqlSession(session);
      return { data: { session, user: session.user }, error: null };
    },

    async signOut() {
      setSqlSession(null);
    },

    async getUser() {
      const session = getSqlSession();
      if (!session) return { data: { user: null }, error: null };
      return { data: { user: session.user }, error: null };
    },

    async updateUser(_updates: any) {
      return { data: null, error: null };
    },
  },
};

export const sqlDb = {
  from(table: string) {
    return new SqlQueryBuilder(table);
  },

  async rpc(fn: string, params?: Record<string, unknown>) {
    const session = getSqlSession();
    const rec = session?._sqlRecord;
    const merged = {
      ...(params || {}),
      p_tenant_id: (params as any)?.p_tenant_id ?? rec?.tenant_id,
      p_opened_by: (params as any)?.p_opened_by ?? rec?.user_id,
      p_closed_by: (params as any)?.p_closed_by ?? rec?.user_id,
    };
    if (isVdsBackend()) {
      try {
        const result = await vdsPost<{ data: any; error?: string }>('/rpc', { fn, params: merged });
        if (result?.error) return { data: null, error: new Error(result.error) };
        return { data: result.data ?? null, error: null };
      } catch (err: any) {
        return { data: null, error: err };
      }
    }
    const api = eApi();
    if (!api?.sqlRpc) {
      return { data: null, error: new Error('SQL RPC desteklenmiyor') };
    }
    try {
      const result = await api.sqlRpc({ fn, params: merged });
      if (result?.error) return { data: null, error: new Error(result.error) };
      return { data: result.data ?? null, error: null };
    } catch (err: any) {
      return { data: null, error: err };
    }
  },

  channel(_name: string) {
    return noopChannel;
  },

  removeChannel(_ch: any) {},

  functions: {
    async invoke(name: string, opts?: { body?: Record<string, unknown> }) {
      try {
        const result = await vdsPost<any>(`/fn/${encodeURIComponent(name)}`, opts?.body || {});
        if (result?.error && result.success === false) {
          return { data: result, error: new Error(String(result.error)) };
        }
        return { data: result, error: null };
      } catch (err: any) {
        return { data: null, error: err };
      }
    },
  },

  auth: {
    async getSession() {
      const session = getSqlSession();
      return { data: { session } };
    },

    onAuthStateChange(cb: AuthCallback) {
      authCallbacks.push(cb);
      const session = getSqlSession();
      if (session) {
        setTimeout(() => cb('INITIAL_SESSION', session), 0);
      } else {
        setTimeout(() => cb('SIGNED_OUT', null), 0);
      }
      return {
        data: {
          subscription: {
            unsubscribe() {
              const idx = authCallbacks.indexOf(cb);
              if (idx >= 0) authCallbacks.splice(idx, 1);
            },
          },
        },
      };
    },

    async signInWithPassword({ email, password }: { email: string; password: string }) {
      if (isVdsBackend()) {
        try {
          const origin = getVdsApiOrigin();
          const res = await fetch(vdsApiUrl('/login'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
            credentials: origin ? 'omit' : 'same-origin',
          });
          const result = await res.json().catch(() => null) as { success?: boolean; error?: string; data?: any; token?: string } | null;
          if (res.status === 502 || res.status === 503) {
            return {
              data: null,
              error: new Error(
                'Giriş servisi şu an kapalı (VDS API). Bir dakika sonra tekrar deneyin; sorun sürerse sunucuda SefposVdsApiWatchdog görevini kontrol edin.',
              ),
            };
          }
          if (!result?.success) {
            return { data: null, error: new Error(result?.error || 'Giriş başarısız') };
          }
          const session = buildSessionFromRecord(result.data);
          if (result.token) session.access_token = result.token;
          setSqlSession(session);
          return { data: { session, user: session.user }, error: null };
        } catch (err: any) {
          const msg = String(err?.message || err || '');
          if (/failed to fetch|networkerror|load failed/i.test(msg)) {
            return {
              data: null,
              error: new Error(
                'Giriş servisine ulaşılamadı. https://sefpos.com.tr adresini kullanın (www SSL sorunlu olabilir) ve sayfayı yenileyip tekrar deneyin.',
              ),
            };
          }
          return { data: null, error: err };
        }
      }

      const api = eApi();
      if (!api) return { data: null, error: new Error('Electron API bulunamadi') };

      if (isLocalMode()) {
        const result = await api.localDbLogin({ email, password });
        if (!result.success) return { data: null, error: new Error(result.error || 'Giris basarisiz') };
        const session = buildSessionFromRecord(result.data);
        setSqlSession(session);
        return { data: { session, user: session.user }, error: null };
      }

      const em = String(email || '').trim().toLowerCase();
      if (isHybridMode() && isHybridCloudLinked() && !em.endsWith('@shefpos.local')) {
        let result = await api.sqlLogin({ email: em, password });
        if (!result.success && typeof navigator !== 'undefined' && navigator.onLine) {
          result = await api.hybridKasaLogin({ email: em, password });
        }
        if (!result.success) {
          return { data: null, error: new Error(result.error || 'Giris basarisiz') };
        }
        const session = buildSessionFromRecord(result.data);
        setSqlSession(session);
        return { data: { session, user: session.user }, error: null };
      }

      /** Bulut e-posta → VDS (Supabase yok). */
      if (isCloudLoginEmail(em)) {
        try {
          localStorage.setItem('dbMode', 'cloud');
          await api.setDbMode?.('cloud');
        } catch {
          /* ignore */
        }
        try {
          const res = await fetch(`${DEFAULT_REMOTE_VDS_ORIGIN}/vds-api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: em, password }),
            credentials: 'omit',
          });
          const result = (await res.json().catch(() => null)) as {
            success?: boolean;
            error?: string;
            data?: any;
            token?: string;
          } | null;
          if (!result?.success) {
            return { data: null, error: new Error(result?.error || 'Giriş başarısız') };
          }
          const session = buildSessionFromRecord(result.data);
          if (result.token) session.access_token = result.token;
          setSqlSession(session);
          return { data: { session, user: session.user }, error: null };
        } catch (err: any) {
          return { data: null, error: err };
        }
      }

      const result = await api.sqlLogin({ email, password });
      if (!result.success) {
        return { data: null, error: new Error(result.error || 'Giris basarisiz') };
      }
      const session = buildSessionFromRecord(result.data);
      setSqlSession(session);
      return { data: { session, user: session.user }, error: null };
    },

    async signUp({ email, password, options }: { email: string; password: string; options?: any }) {
      if (isVdsBackend()) {
        try {
          const fullName = options?.data?.full_name || '';
          const tenantName = options?.data?.tenant_name || '';
          const phone = options?.data?.phone || '';
          const origin = getVdsApiOrigin();
          const res = await fetch(vdsApiUrl('/register'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email,
              password,
              fullName,
              tenantName,
              phone,
            }),
            credentials: origin ? 'omit' : 'same-origin',
          });
          const result = (await res.json().catch(() => null)) as {
            success?: boolean;
            error?: string;
            data?: any;
            token?: string;
          } | null;
          if (!result?.success) {
            return { data: null, error: new Error(result?.error || 'Kayıt başarısız') };
          }
          const session = buildSessionFromRecord(result.data);
          if (result.token) session.access_token = result.token;
          setSqlSession(session);
          return { data: { session, user: session.user }, error: null };
        } catch (err: any) {
          return { data: null, error: err };
        }
      }

      const api = eApi();
      if (!api) return { data: null, error: new Error('Electron API bulunamadi') };
      const fullName = options?.data?.full_name || '';
      const tenantName = options?.data?.tenant_name || '';

      if (isLocalMode()) {
        const result = await api.localDbRegister({ email, password, fullName, tenantName });
        if (!result.success) return { data: null, error: new Error(result.error || 'Kayit basarisiz') };
        const session = buildSessionFromRecord(result.data);
        setSqlSession(session);
        return { data: { session, user: session.user }, error: null };
      }

      const hashResult = await api.sqlHashPassword(password);
      if (!hashResult.success) return { data: null, error: new Error(hashResult.error) };
      const tenantSlug = tenantName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').slice(0, 50);
      const result = await api.sqlRegister({
        email,
        passwordHash: hashResult.hash,
        fullName,
        tenantName,
        tenantSlug,
      });
      if (!result.success) {
        return { data: null, error: new Error(result.error || 'Kayit basarisiz') };
      }
      const loginResult = await api.sqlLogin({ email, password });
      if (loginResult.success) {
        const session = buildSessionFromRecord(loginResult.data);
        setSqlSession(session);
        return { data: { session, user: session.user }, error: null };
      }
      return { data: { user: { id: result.user_id, email } }, error: null };
    },

    async signOut() {
      setSqlSession(null);
    },

    async refreshSession() {
      const session = getSqlSession();
      return { data: { session }, error: session ? null : new Error('Oturum yok') };
    },

    async getUser() {
      const session = getSqlSession();
      if (!session) return { data: { user: null }, error: null };
      return { data: { user: session.user }, error: null };
    },
  },
};
