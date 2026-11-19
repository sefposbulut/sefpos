'use strict';

const https = require('https');
const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');

const DEFAULT_VDS_ORIGIN = 'https://sefpos.com.tr';
const PRINT_JOB_MAX_AGE_MINUTES = 30;
/** Aynı yazıcıya ardışık baskı arası (donanım) */
const PRINT_MIN_INTERVAL_MS = 60;
/** Yeni işleri agresif tara — 100 garson kuyruğu birikmesin */
const POLL_MS_IDLE = 4000;
const POLL_MS_BUSY = 400;

function allowedVdsOrigin(raw) {
  const fallback = DEFAULT_VDS_ORIGIN;
  try {
    const u = new URL(String(raw || fallback));
    const host = u.hostname.toLowerCase();
    if (u.protocol === 'https:' && (host === 'sefpos.com.tr' || host.endsWith('.sefpos.com.tr'))) {
      return u.origin;
    }
    if ((u.protocol === 'http:' || u.protocol === 'https:') && (host === '127.0.0.1' || host === 'localhost')) {
      return u.origin;
    }
  } catch {
    /* yoksay */
  }
  return fallback;
}
const REGISTER_MS = 60_000;
const STALE_PROCESSING_MS = 90_000;
const RECLAIM_EVERY_MS = 25_000;
const FETCH_BATCH = 40;

function getSessionPath() {
  const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  return path.join(appData, 'Sefpos', 'print-agent-session.json');
}

function ensureSessionDir() {
  const dir = path.dirname(getSessionPath());
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readSession() {
  try {
    const raw = fs.readFileSync(getSessionPath(), 'utf8');
    const s = JSON.parse(raw);
    if (!s?.tenantId || !s?.userJwt) return null;
    return {
      tenantId: s.tenantId,
      branchId: s.branchId || null,
      userJwt: s.userJwt,
      vdsOrigin: allowedVdsOrigin(s.vdsOrigin),
      agentToken: s.agentToken || null,
      printers: Array.isArray(s.printers) ? s.printers : [],
    };
  } catch {
    return null;
  }
}

function writeSession(partial) {
  ensureSessionDir();
  const prev = readSession() || {};
  const next = {
    ...prev,
    ...partial,
    savedAt: new Date().toISOString(),
  };
  fs.writeFileSync(getSessionPath(), JSON.stringify(next, null, 2), 'utf8');
  return next;
}

function vdsFetch(session, apiPath, body) {
  return new Promise((resolve, reject) => {
    const origin = allowedVdsOrigin(session.vdsOrigin);
    const url = new URL(origin + apiPath);
    const lib = url.protocol === 'https:' ? https : http;
    const payload = body == null ? null : JSON.stringify(body);
    const req = lib.request(
      {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.userJwt}`,
          'Content-Type': 'application/json',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        },
        timeout: 15000,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          let parsed = null;
          try {
            parsed = JSON.parse(data || '{}');
          } catch {
            parsed = { error: data };
          }
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300 && !parsed?.error,
            status: res.statusCode,
            data: parsed,
          });
        });
      },
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('timeout'));
    });
    if (payload) req.write(payload);
    req.end();
  });
}

function isVirtualPrinterName(name) {
  const n = String(name || '').toLowerCase();
  return (
    n.includes('onenote') ||
    n.includes('fax') ||
    n.includes('xps') ||
    n.includes('microsoft print to pdf') ||
    n.includes('send to')
  );
}

function isPos80FamilyName(name) {
  const k = String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  return k.includes('pos80c') || k === 'pos80' || /^pos80/.test(k);
}

function pickDefaultKitchenPrinter(printers) {
  const kw = ['pos-80c', 'pos80c', 'pos-80', 'pos80', '80mm', 'mutfak', 'kitchen', 'thermal', 'fis', 'fiş', 'kasa', 'bar', 'grill'];
  const named = printers
    .map((p) => (typeof p === 'string' ? p : p?.name || ''))
    .filter((n) => n && !isVirtualPrinterName(n));
  const pos = named.find((n) => isPos80FamilyName(n));
  if (pos) return pos;
  for (const k of kw) {
    const hit = named.find((n) => {
      const nl = n.toLowerCase();
      if (!nl.includes(k)) return false;
      if (k === '80mm' && nl.includes('80mm') && !isPos80FamilyName(n) && named.some(isPos80FamilyName)) {
        return false;
      }
      return true;
    });
    if (hit) return hit;
  }
  return named[0] || '';
}

function printJobIsExpired(job) {
  const raw = job?.created_at || job?.updated_at;
  if (!raw) return false;
  const t = new Date(raw).getTime();
  if (Number.isNaN(t)) return false;
  // created_at TR saati Z ile gelirse gelecekte görünür — negatif farkı yok say
  const age = Date.now() - t;
  if (age < 0) return false;
  return age > PRINT_JOB_MAX_AGE_MINUTES * 60 * 1000;
}

/**
 * @param {{
 *   handlePrint: (html: string, printerName: string) => Promise<{ success: boolean, error?: string }>,
 *   listPrinters?: () => Promise<Array<{ name: string }>>,
 * }} opts
 */
function startQueuePoller(opts) {
  const processingJobIds = new Set();
  let lastRegisterAt = 0;
  let lastReclaimAt = 0;
  let fetchLock = false;
  const lastPrintAtByPrinter = new Map();
  /** @type {Map<string, { busy: boolean, list: any[] }>} */
  const printerQueues = new Map();

  async function updatePrintJobStatus(session, jobId, status, error) {
    const data = {
      status,
      updated_at: new Date().toISOString(),
      ...(error !== undefined ? { error: error == null ? '' : String(error) } : {}),
    };
    try {
      const res = await vdsFetch(session, '/vds-api/query', {
        table: 'print_jobs',
        operation: 'update',
        data,
        filters: [{ col: 'id', op: 'eq', val: jobId }],
      });
      if (!res.ok) {
        console.warn('[print-agent] job durumu güncellenemedi:', res.data?.error || res.status);
        return false;
      }
      return true;
    } catch (err) {
      console.warn('[print-agent] job durumu güncellenemedi:', err.message);
      return false;
    }
  }

  async function processPrintJob(session, job) {
    try {
      if (printJobIsExpired(job)) {
        await updatePrintJobStatus(session, job.id, 'failed', 'Süresi doldu (otomatik iptal)');
        return;
      }

      let targetPrinter = String(job.printer_name || '').trim();
      if (!targetPrinter) {
        targetPrinter = pickDefaultKitchenPrinter(session.printers);
      }

      const paceKey = (targetPrinter || '__default__').toLowerCase();
      const lastAt = lastPrintAtByPrinter.get(paceKey) || 0;
      const waitMs = PRINT_MIN_INTERVAL_MS - (Date.now() - lastAt);
      if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));

      const html = job.html || job.payload?.html || '';
      if (!html) {
        await updatePrintJobStatus(session, job.id, 'failed', 'html yok');
        return;
      }

      let heartAlive = true;
      const heartbeat = setInterval(() => {
        if (!heartAlive) return;
        updatePrintJobStatus(session, job.id, 'processing', '').catch(() => {});
      }, 25_000);

      let result;
      try {
        result = await opts.handlePrint(html, targetPrinter);
      } finally {
        heartAlive = false;
        clearInterval(heartbeat);
      }

      lastPrintAtByPrinter.set(paceKey, Date.now());

      if (result.success) {
        const ok = await updatePrintJobStatus(session, job.id, 'done', '');
        if (!ok) {
          await new Promise((r) => setTimeout(r, 250));
          await updatePrintJobStatus(session, job.id, 'done', '');
        }
        console.log(`[print-agent] Kuyruk fişi basıldı: ${job.id} → ${targetPrinter || '(varsayılan)'}`);
      } else {
        await updatePrintJobStatus(session, job.id, 'failed', result.error || 'Bilinmeyen hata');
      }
    } catch (err) {
      await updatePrintJobStatus(session, job.id, 'failed', err.message);
    } finally {
      processingJobIds.delete(job.id);
    }
  }

  function enqueueClaimed(session, job) {
    const key = String(
      job.printer_name || pickDefaultKitchenPrinter(session.printers) || '__default__',
    ).toLowerCase();
    let q = printerQueues.get(key);
    if (!q) {
      q = { busy: false, list: [] };
      printerQueues.set(key, q);
    }
    q.list.push(job);
    void drainPrinter(session, key);
  }

  async function drainPrinter(session, key) {
    const q = printerQueues.get(key);
    if (!q || q.busy) return;
    q.busy = true;
    try {
      while (q.list.length > 0) {
        const job = q.list.shift();
        await processPrintJob(session, job);
      }
    } finally {
      q.busy = false;
      if (q.list.length > 0) void drainPrinter(session, key);
    }
  }

  async function reclaimStaleProcessing(session) {
    try {
      const result = await vdsFetch(session, '/vds-api/query', {
        table: 'print_jobs',
        operation: 'select',
        select: 'id,status,updated_at,created_at,printer_name',
        filters: [
          { col: 'tenant_id', op: 'eq', val: session.tenantId },
          { col: 'status', op: 'eq', val: 'processing' },
        ],
        orderBy: [{ col: 'created_at', asc: true }],
        limitVal: 50,
      });
      const rows = Array.isArray(result.data?.data) ? result.data.data : [];
      const cutoff = Date.now() - STALE_PROCESSING_MS;
      for (const job of rows) {
        if (processingJobIds.has(job.id)) continue;
        const t = new Date(job.updated_at || job.created_at).getTime();
        if (Number.isNaN(t) || t >= cutoff) continue;
        const ok = await updatePrintJobStatus(session, job.id, 'pending', 'Yeniden kuyruğa alındı');
        if (!ok) {
          await updatePrintJobStatus(session, job.id, 'failed', 'Takılı kaldı (ajan yanıt vermedi)');
        } else {
          console.warn(`[print-agent] takılı iş yeniden kuyruk: ${job.id}`);
        }
      }
    } catch {
      /* ignore */
    }
  }

  async function fetchPendingJobs(session) {
    if (fetchLock) return 0;
    fetchLock = true;
    try {
      if (Date.now() - lastReclaimAt > RECLAIM_EVERY_MS) {
        lastReclaimAt = Date.now();
        await reclaimStaleProcessing(session);
      }

      const result = await vdsFetch(session, '/vds-api/query', {
        table: 'print_jobs',
        operation: 'select',
        select: 'id,tenant_id,branch_id,html,printer_name,status,created_at',
        filters: [
          { col: 'tenant_id', op: 'eq', val: session.tenantId },
          { col: 'status', op: 'eq', val: 'pending' },
        ],
        orderBy: [{ col: 'created_at', asc: true }],
        limitVal: FETCH_BATCH,
      });
      const rows = Array.isArray(result.data?.data) ? result.data.data : [];
      let claimed = 0;
      const jobs = rows.filter((job) => {
        if (processingJobIds.has(job.id)) return false;
        if (session.branchId && job.branch_id && String(job.branch_id) !== String(session.branchId)) {
          return false;
        }
        return true;
      });

      // Claim hemen — poll tekrar aynı işi almasın; yazıcı kuyrukları paralel aksın
      for (const job of jobs) {
        if (processingJobIds.has(job.id)) continue;
        processingJobIds.add(job.id);
        const claim = await vdsFetch(session, '/vds-api/query', {
          table: 'print_jobs',
          operation: 'update',
          data: { status: 'processing', updated_at: new Date().toISOString(), error: '' },
          filters: [
            { col: 'id', op: 'eq', val: job.id },
            { col: 'status', op: 'eq', val: 'pending' },
          ],
        });
        if (!claim.ok) {
          processingJobIds.delete(job.id);
          continue;
        }
        enqueueClaimed(session, job);
        claimed += 1;
      }
      return claimed;
    } finally {
      fetchLock = false;
    }
  }

  async function registerPrinters(session) {
    if (!opts.listPrinters) return;
    try {
      const printers = await opts.listPrinters();
      const names = (printers || [])
        .map((p) => ({ name: p.name || p.Name || String(p), isDefault: !!p.isDefault }))
        .filter((p) => p.name);
      writeSession({ printers: names });
      session.printers = names;

      await vdsFetch(session, '/vds-api/query', {
        table: 'printer_registrations',
        operation: 'upsert',
        data: {
          id: session.tenantId,
          tenant_id: session.tenantId,
          branch_id: session.branchId || null,
          printers: names,
          last_seen_at: new Date().toISOString(),
        },
      });
      console.log(`[print-agent] ${names.length} yazıcı kaydedildi (tarayıcıda görünür)`);
    } catch (err) {
      console.warn('[print-agent] yazıcı kaydı:', err.message);
    }
  }

  let timer = null;
  let stopped = false;
  async function tick() {
    const session = readSession();
    let wait = POLL_MS_IDLE;
    if (session) {
      try {
        if (Date.now() - lastRegisterAt > REGISTER_MS) {
          lastRegisterAt = Date.now();
          await registerPrinters(session);
        }
        const n = await fetchPendingJobs(session);
        if (n > 0) wait = POLL_MS_BUSY;
      } catch (err) {
        console.warn('[print-agent] poll:', err.message);
      }
    }
    if (!stopped) timer = setTimeout(() => { tick().catch(() => {}); }, wait);
  }
  tick().catch(() => {});

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}

module.exports = {
  startQueuePoller,
  getSessionPath,
  readSession,
  writeSession,
  DEFAULT_VDS_ORIGIN,
  allowedVdsOrigin,
};
