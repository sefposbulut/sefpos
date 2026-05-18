'use strict';

const https = require('https');
const os = require('os');
const fs = require('fs');
const path = require('path');

const DEFAULT_SUPABASE_URL = 'https://xdfnozfuuzctubijbnds.supabase.co';
const DEFAULT_ANON_KEY = 'sb_publishable_wrSHY5Kzkw-bx0XzYM5VFA_FK3BFF_x';
const PRINT_JOB_MAX_AGE_MINUTES = 30;
const PRINT_MIN_INTERVAL_MS = 2000;
const POLL_MS = 2000;

function getSessionPath() {
  const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  return path.join(appData, 'Sefpos', 'print-agent-session.json');
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
      supabaseUrl: (s.supabaseUrl || DEFAULT_SUPABASE_URL).replace(/\/$/, ''),
      anonKey: s.anonKey || DEFAULT_ANON_KEY,
      printers: Array.isArray(s.printers) ? s.printers : [],
    };
  } catch {
    return null;
  }
}

function supabaseFetch(session, endpoint, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(session.supabaseUrl + endpoint);
    const reqOptions = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: options.method || 'GET',
      headers: {
        apikey: session.anonKey,
        Authorization: `Bearer ${session.userJwt}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
        ...(options.headers || {}),
      },
    };

    const req = https.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            data: JSON.parse(data || '[]'),
          });
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

function pickDefaultKitchenPrinter(printers) {
  const kw = ['mutfak', 'kitchen', 'mutfa', 'kasa', 'bar', 'grill', 'thermal', 'fis', 'fiş'];
  const named = printers
    .map((p) => (typeof p === 'string' ? p : (p?.name || '')))
    .filter(Boolean);
  for (const k of kw) {
    const hit = named.find((n) => n.toLowerCase().includes(k));
    if (hit) return hit;
  }
  return named[0] || '';
}

function printJobIsExpired(job) {
  const raw = job?.created_at;
  if (!raw) return false;
  const t = new Date(raw).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t > PRINT_JOB_MAX_AGE_MINUTES * 60 * 1000;
}

/**
 * @param {{ handlePrint: (html: string, printerName: string) => Promise<{ success: boolean }> }} opts
 */
function startQueuePoller(opts) {
  const processingJobIds = new Set();
  let lastDoPrintAt = 0;
  let timer = null;

  async function updatePrintJobStatus(session, jobId, status, error) {
    try {
      const body = JSON.stringify({
        status,
        updated_at: new Date().toISOString(),
        ...(error !== undefined ? { error } : {}),
      });
      await supabaseFetch(session, `/rest/v1/print_jobs?id=eq.${jobId}`, {
        method: 'PATCH',
        body,
      });
    } catch (err) {
      console.warn('[print-agent] job durumu güncellenemedi:', err.message);
    }
  }

  async function processPrintJob(session, job) {
    if (processingJobIds.has(job.id)) return;
    processingJobIds.add(job.id);

    try {
      if (printJobIsExpired(job)) {
        await updatePrintJobStatus(session, job.id, 'failed', 'Süresi doldu (otomatik iptal)');
        return;
      }

      const claimed = await supabaseFetch(
        session,
        `/rest/v1/print_jobs?id=eq.${job.id}&status=eq.pending`,
        {
          method: 'PATCH',
          body: JSON.stringify({ status: 'processing', updated_at: new Date().toISOString() }),
        }
      );

      if (!claimed.ok || !Array.isArray(claimed.data) || claimed.data.length === 0) {
        return;
      }

      let targetPrinter = (job.printer_name || '').trim();
      if (!targetPrinter) {
        targetPrinter = pickDefaultKitchenPrinter(session.printers);
      }

      const waitMs = PRINT_MIN_INTERVAL_MS - (Date.now() - lastDoPrintAt);
      if (waitMs > 0) {
        await new Promise((r) => setTimeout(r, waitMs));
      }

      const result = await opts.handlePrint(job.html, targetPrinter);
      lastDoPrintAt = Date.now();

      if (result.success) {
        await updatePrintJobStatus(session, job.id, 'done', '');
        console.log(`[print-agent] Kuyruk fişi basıldı: ${job.id}`);
      } else {
        await updatePrintJobStatus(session, job.id, 'failed', result.error || 'Bilinmeyen hata');
      }
    } catch (err) {
      await updatePrintJobStatus(session, job.id, 'failed', err.message);
    } finally {
      processingJobIds.delete(job.id);
    }
  }

  async function fetchPendingJobs(session) {
    const tenantFilter = `&tenant_id=eq.${session.tenantId}`;
    const branchFilter = session.branchId
      ? `&or=(branch_id.eq.${session.branchId},branch_id.is.null)`
      : '';
    const result = await supabaseFetch(
      session,
      `/rest/v1/print_jobs?status=eq.pending${tenantFilter}${branchFilter}&order=created_at.asc&limit=8`
    );
    if (!result.ok || !Array.isArray(result.data)) return;
    for (const job of result.data) {
      await processPrintJob(session, job);
    }
  }

  async function tick() {
    const session = readSession();
    if (!session) return;
    try {
      await fetchPendingJobs(session);
    } catch (err) {
      console.warn('[print-agent] Kuyruk poll hatası:', err.message);
    }
  }

  timer = setInterval(() => {
    tick().catch(() => {});
  }, POLL_MS);
  tick().catch(() => {});

  return () => {
    if (timer) clearInterval(timer);
    timer = null;
  };
}

module.exports = { startQueuePoller, getSessionPath, readSession };
