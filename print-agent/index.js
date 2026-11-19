'use strict';

/**
 * ŞefPOS Print Agent — tarayıcı (www) için yerel yazıcı köprüsü.
 * Electron kurmadan: EXE çalışır → yazıcılar VDS'e kaydolur → fiş kuyruğu basılır.
 *
 * Dinler: http://127.0.0.1:7878
 * Eşleme:  http://127.0.0.1:7878/pair?...  (HTTPS sayfasından window.open ile)
 */

const http = require('http');
const crypto = require('crypto');
const { exec } = require('child_process');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const {
  startQueuePoller,
  writeSession,
  readSession,
  getSessionPath,
  DEFAULT_VDS_ORIGIN,
  allowedVdsOrigin,
} = require('./queuePoller');
const {
  PRODUCT,
  install,
  uninstall,
  ensureInstalledOnFirstRun,
  isInstalled,
  getInstallDir,
  getInstalledExePath,
  startDaemonNow,
  waitForAgent,
  appendLog,
} = require('./install');

const execAsync = promisify(exec);
const PORT = 7878;
const AGENT_VERSION = '1.3.9';

function showMsg(text) {
  try {
    const { execFileSync } = require('child_process');
    execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.MessageBox]::Show(${JSON.stringify(
          text,
        )}, ${JSON.stringify(PRODUCT)}, 'OK', 'Information')`,
      ],
      { windowsHide: false },
    );
  } catch {
    /* ignore */
  }
}

/** sefpos-print://pair?jwt=...&tenant=... — ajan kapalıyken de Windows EXE'yi açar */
function handleProtocolUrl(rawUrl) {
  try {
    appendLog('protocol ' + String(rawUrl || '').slice(0, 120));
    const u = new URL(String(rawUrl || '').replace(/^sefpos-print:/i, 'http:'));
    const jwt = u.searchParams.get('jwt') || u.searchParams.get('token') || '';
    const tenantId = u.searchParams.get('tenant') || u.searchParams.get('tenantId') || '';
    const branchId = u.searchParams.get('branch') || u.searchParams.get('branchId') || '';
    const vdsOrigin = u.searchParams.get('vds') || DEFAULT_VDS_ORIGIN;
    if (!jwt || !tenantId) {
      showMsg('Eşleme bilgisi eksik. Tarayıcıdan tekrar «Yazıcı ajanını bağla» deyin.');
      return { ok: false };
    }
    writeSession({
      userJwt: jwt,
      tenantId,
      branchId: branchId || null,
      vdsOrigin: String(vdsOrigin).replace(/\/$/, ''),
    });
    startDaemonNow();
    const alive = waitForAgent(10000);
    if (!alive) {
      // Bu süreç dinlesin
      return { ok: true, needListen: true };
    }
    showMsg(
      'Eşleme tamam ✓\n\nŞefPOS Yazıcı Ajanı bağlı.\nArtık web’den yazdırabilirsiniz.\n\nBu pencereyi kapatabilirsiniz.',
    );
    return { ok: true, needListen: false };
  } catch (e) {
    appendLog('protocol err ' + (e && e.message));
    showMsg('Eşleme hatası: ' + (e && e.message));
    return { ok: false };
  }
}

let _req = null;

function corsHeaders(extra = {}) {
  const origin = String(_req?.headers?.origin || '');
  const allow =
    !origin ||
    origin === 'https://sefpos.com.tr' ||
    origin === 'https://www.sefpos.com.tr' ||
    origin === 'http://localhost:5180' ||
    origin === 'http://127.0.0.1:5180' ||
    /^https:\/\/([a-z0-9-]+\.)?sefpos\.com\.tr$/i.test(origin);
  const headers = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Sefpos-Agent-Token',
    Vary: 'Origin',
    ...extra,
  };
  if (allow) headers['Access-Control-Allow-Origin'] = origin || 'https://sefpos.com.tr';
  return headers;
}

function ensureAgentToken() {
  const session = readSession();
  if (session?.agentToken) return session.agentToken;
  const token = crypto.randomBytes(24).toString('hex');
  writeSession({ agentToken: token });
  return token;
}

function agentTokenOk(req) {
  const session = readSession();
  const presented = String(req.headers['x-sefpos-agent-token'] || '');
  return !!(session?.agentToken && presented && presented === session.agentToken);
}

function sendJson(res, statusCode, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(statusCode, {
    ...corsHeaders({ 'Content-Type': 'application/json; charset=utf-8' }),
  });
  res.end(body);
}

function sendHtml(res, statusCode, html) {
  res.writeHead(statusCode, {
    ...corsHeaders({ 'Content-Type': 'text/html; charset=utf-8' }),
  });
  res.end(html);
}

/** OneNote / bulut / sanal yazıcılar Microsoft hesap penceresi açar — listeden çıkar. */
function isVirtualOrCloudPrinter(name) {
  const n = String(name || '').toLowerCase();
  return (
    n.includes('onenote') ||
    n.includes('one note') ||
    n.includes('fax') ||
    n.includes('xps') ||
    n.includes('microsoft print to pdf') ||
    n.includes('send to') ||
    n.includes('pdfcreator') ||
    n.includes('adobe pdf') ||
    n.includes('universal print') ||
    n.includes('anydesk') ||
    n.includes('remote desktop')
  );
}

async function getWindowsPrinters() {
  try {
    const ps =
      "Get-Printer | Select-Object Name,DriverName,PrinterStatus | ConvertTo-Json -Compress";
    const { stdout } = await execAsync(
      `powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -Command "${ps}"`,
      { timeout: 12000, windowsHide: true },
    );
    const raw = stdout.trim();
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const arr = Array.isArray(parsed) ? parsed : [parsed];
    return arr
      .map((p) => ({
        name: p.Name || '',
        description: p.DriverName || '',
        status: p.PrinterStatus || 0,
        isDefault: false,
      }))
      .filter((p) => p.name && !isVirtualOrCloudPrinter(p.name));
  } catch (err) {
    console.warn('[print-agent] yazıcı listesi:', err.message);
    return [];
  }
}

function findBrowserExe() {
  const candidates = [
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ].filter(Boolean);
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/**
 * Önizleme = baskı: uygulama HTML + <style> aynen korunur.
 * Ajan sadece kağıt genişliği / @page ayarlar — mutfak/adisyon CSS'ini EZMEZ.
 */
function wrapReceiptHtml(html) {
  const raw = String(html || '');
  const styleChunks = [];
  let bodyHtml = raw.replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, (_, css) => {
    styleChunks.push(String(css || ''));
    return '';
  });
  bodyHtml = bodyHtml
    .replace(/margin-left\s*:\s*[-.\d]+\s*mm/gi, 'margin-left:0')
    .replace(/margin-right\s*:\s*[-.\d]+\s*mm/gi, 'margin-right:0');

  const W = '72mm';
  const shellCss = `
  * { box-sizing: border-box; }
  html, body {
    width: ${W} !important;
    max-width: ${W} !important;
    margin: 0 !important;
    padding: 0 !important;
    background: #fff !important;
    color: #000 !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  @page { size: 80mm auto; margin: 0; }
  @media print {
    html, body { width: ${W} !important; max-width: ${W} !important; margin: 0 !important; padding: 0 !important; }
  }
`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
<title>ŞefPOS Fiş</title>
<style>
${shellCss}
${styleChunks.join('\n')}
</style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}

async function printSilentWebBrowser(html, printerName) {
  if (printerName && isVirtualOrCloudPrinter(printerName)) {
    return {
      success: false,
      error: `Bu yazıcı desteklenmiyor (OneNote/PDF/bulut): ${printerName}. 80mm / POS-80 yazıcı seçin.`,
    };
  }

  const tmpDir = os.tmpdir();
  const stamp = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  const tmpHtml = path.join(tmpDir, `sefpos_print_${stamp}.html`);
  const tmpPs1 = path.join(tmpDir, `sefpos_print_${stamp}.ps1`);
  fs.writeFileSync(tmpHtml, wrapReceiptHtml(html), 'utf8');

  const safePrinter = printerName ? String(printerName).replace(/'/g, "''") : '';
  const htmlEsc = tmpHtml.replace(/'/g, "''");

  const psScript = [
    "$ErrorActionPreference = 'Stop'",
    "Add-Type -AssemblyName System.Windows.Forms",
    `$htmlPath = '${htmlEsc}'`,
    `$printerName = '${safePrinter}'`,
    '$prev = $null',
    '$form = $null',
    '$wb = $null',
    'try {',
    '  # IE yazdırma: sığdırma kapat + kenar boşluğu 0 (72mm fiş A4’e küçülmesin)',
    "  $ieMain = 'HKCU:\\Software\\Microsoft\\Internet Explorer\\Main'",
    '  New-Item -Path $ieMain -Force | Out-Null',
    "  Set-ItemProperty -Path $ieMain -Name 'Print_Shrink_To_Fit' -Value 'no' -Force",
    "  $iePage = 'HKCU:\\Software\\Microsoft\\Internet Explorer\\PageSetup'",
    '  New-Item -Path $iePage -Force | Out-Null',
    "  Set-ItemProperty -Path $iePage -Name 'margin_left' -Value '0.00000' -Force",
    "  Set-ItemProperty -Path $iePage -Name 'margin_right' -Value '0.00000' -Force",
    "  Set-ItemProperty -Path $iePage -Name 'margin_top' -Value '0.00000' -Force",
    "  Set-ItemProperty -Path $iePage -Name 'margin_bottom' -Value '0.00000' -Force",
    "  Set-ItemProperty -Path $iePage -Name 'header' -Value '' -Force",
    "  Set-ItemProperty -Path $iePage -Name 'footer' -Value '' -Force",
    '  if ($printerName) {',
    '    $prevObj = Get-CimInstance -ClassName Win32_Printer -ErrorAction SilentlyContinue | Where-Object { $_.Default -eq $true } | Select-Object -First 1',
    '    if ($prevObj) { $prev = $prevObj.Name }',
    '    if ($prev -ne $printerName) {',
    '      $target = Get-CimInstance -ClassName Win32_Printer -ErrorAction SilentlyContinue | Where-Object { $_.Name -eq $printerName } | Select-Object -First 1',
    "      if (-not $target) { throw ('Yazici bulunamadi: ' + $printerName) }",
    '      $null = Invoke-CimMethod -InputObject $target -MethodName SetDefaultPrinter',
    '      Start-Sleep -Milliseconds 120',
    '    }',
    '  }',
    '  $form = New-Object System.Windows.Forms.Form',
    '  $form.Width = 2',
    '  $form.Height = 2',
    '  $form.ShowInTaskbar = $false',
    '  $form.Opacity = 0',
    "  $form.FormBorderStyle = 'FixedToolWindow'",
    '  $form.StartPosition = [System.Windows.Forms.FormStartPosition]::Manual',
    '  $form.Location = New-Object System.Drawing.Point(-4000, -4000)',
    '  $wb = New-Object System.Windows.Forms.WebBrowser',
    '  $wb.ScriptErrorsSuppressed = $true',
    '  $wb.Width = 272',
    '  $wb.Height = 900',
    '  $form.Controls.Add($wb)',
    '  $form.Show()',
    '  $uri = ([System.Uri]$htmlPath).AbsoluteUri',
    '  $wb.Navigate($uri)',
    '  $sw = [System.Diagnostics.Stopwatch]::StartNew()',
    "  while ($wb.ReadyState -ne 'Complete' -and $sw.ElapsedMilliseconds -lt 15000) {",
    '    [System.Windows.Forms.Application]::DoEvents()',
    '    Start-Sleep -Milliseconds 40',
    '  }',
    '  if ($wb.ReadyState -ne [System.Windows.Forms.WebBrowserReadyState]::Complete) {',
    "    throw 'HTML yuklenemedi'",
    '  }',
    '  Start-Sleep -Milliseconds 80',
    '  [System.Windows.Forms.Application]::DoEvents()',
    '  $ax = $wb.ActiveXInstance',
    '  if (-not $ax) { throw "ActiveXInstance yok" }',
    '  # OLECMDID_PRINT=6, OLECMDEXECOPT_DONTPROMPTUSER=2',
    '  if ($printerName) {',
    '    $defNow = Get-CimInstance -ClassName Win32_Printer -ErrorAction SilentlyContinue | Where-Object { $_.Default -eq $true } | Select-Object -First 1',
    '    if (-not $defNow -or $defNow.Name -ne $printerName) {',
    '      $target2 = Get-CimInstance -ClassName Win32_Printer -ErrorAction SilentlyContinue | Where-Object { $_.Name -eq $printerName } | Select-Object -First 1',
    '      if ($target2) { $null = Invoke-CimMethod -InputObject $target2 -MethodName SetDefaultPrinter; Start-Sleep -Milliseconds 200 }',
    '    }',
    '  }',
    '  $ax.ExecWB(6, 2)',
    '  # Spooler: do not dispose / restore default too early',
    '  $sw2 = [System.Diagnostics.Stopwatch]::StartNew()',
    '  while ($sw2.ElapsedMilliseconds -lt 900) {',
    '    [System.Windows.Forms.Application]::DoEvents()',
    '    Start-Sleep -Milliseconds 80',
    '  }',
    '} finally {',
    '  try { if ($form) { $form.Close() } } catch {}',
    '  try { if ($wb) { $wb.Dispose() } } catch {}',
    '  try { if ($form) { $form.Dispose() } } catch {}',
    '  Start-Sleep -Milliseconds 200',
    '  if ($printerName -and $prev -and $prev -ne $printerName) {',
    '    $old = Get-CimInstance -ClassName Win32_Printer -ErrorAction SilentlyContinue | Where-Object { $_.Name -eq $prev } | Select-Object -First 1',
    '    if ($old) { $null = Invoke-CimMethod -InputObject $old -MethodName SetDefaultPrinter -ErrorAction SilentlyContinue }',
    '  }',
    '  Remove-Item -LiteralPath $htmlPath -Force -ErrorAction SilentlyContinue',
    '}',
    '',
  ].join('\r\n');

  fs.writeFileSync(tmpPs1, psScript, 'utf8');
  try {
    // STA + gizli pencere (CMD/PowerShell ön plana gelmesin)
    await execAsync(
      `powershell -NoProfile -STA -WindowStyle Hidden -ExecutionPolicy Bypass -File "${tmpPs1}"`,
      { timeout: 60000, windowsHide: true },
    );
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  } finally {
    try {
      fs.unlinkSync(tmpPs1);
    } catch {}
    try {
      fs.unlinkSync(tmpHtml);
    } catch {}
  }
}

/** Tercih sırası: POS-80C önce; genel "80mm Series" en sonda. */
const THERMAL_PRINTER_KW = ['pos-80c', 'pos80c', 'pos-80', 'pos80', '80mm', 'thermal', 'mutfak', 'kitchen', 'fis', 'fiş'];

function normalizePrinterKey(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** POS-80C ailesi — "80mm Series Printer" ile karıştırma. */
function isPos80Family(name) {
  const k = normalizePrinterKey(name);
  return k.includes('pos80c') || k === 'pos80' || /^pos80/.test(k);
}

function isGeneric80mmSeries(name) {
  const n = String(name || '').toLowerCase();
  return n.includes('80mm') && !isPos80Family(n);
}

function pickPreferredThermal(names) {
  const list = (names || []).filter(Boolean);
  const pos = list.find((n) => isPos80Family(n));
  if (pos) return pos;
  for (const k of THERMAL_PRINTER_KW) {
    const hit = list.find((n) => {
      const nl = n.toLowerCase();
      if (!nl.includes(k)) return false;
      // "80mm" anahtarı: POS-80 varken generic Series'i atla
      if (k === '80mm' && isGeneric80mmSeries(n) && list.some(isPos80Family)) return false;
      return true;
    });
    if (hit) return hit;
  }
  return list[0] || '';
}

/** Ayarlardaki mantıksal ad (Mutfak) → Windows yazıcı. İstek varsa birebir eşle. */
function resolveWindowsPrinterName(requested, printerList) {
  const names = (printerList || [])
    .map((p) => (typeof p === 'string' ? p : p?.name || ''))
    .filter((n) => n && !isVirtualOrCloudPrinter(n));
  const t = String(requested || '').trim();
  if (!t) {
    return pickPreferredThermal(names);
  }
  // Eski Electron / web ayarı: "80mm Series Printer" seçili ama POS-80C varken oraya bas
  if (isGeneric80mmSeries(t) && names.some(isPos80Family)) {
    const pos = names.find((n) => isPos80Family(n));
    if (pos) {
      console.log(`[print-agent] stale yazıcı "${t}" → ${pos}`);
      return pos;
    }
  }
  // 1) Tam eşleşme (büyük/küçük harf)
  if (names.includes(t)) return t;
  const tl = t.toLowerCase();
  const exactCi = names.find((n) => n.toLowerCase() === tl);
  if (exactCi) return exactCi;
  // 1b) pos80c / POS-80C / pos-80c aynı aile
  const reqKey = normalizePrinterKey(t);
  if (reqKey.includes('pos80')) {
    const posHit = names.find((n) => isPos80Family(n));
    if (posHit) return posHit;
  }
  // 2) İstek adını içeren / istekte geçen en uzun cihaz adı
  //    NOT: kısa yanlış eşleşmeyi engelle (min 4 karakter); generic 80mm'i POS isteğinde ele
  const partial = names
    .filter((n) => {
      const nl = n.toLowerCase();
      if (nl === tl) return true;
      if (nl.includes(tl) && tl.length >= 4) return true;
      if (tl.includes(nl) && nl.length >= 4) return true;
      if (normalizePrinterKey(n) === reqKey) return true;
      return false;
    })
    .filter((n) => {
      if (reqKey.includes('pos80') && isGeneric80mmSeries(n)) return false;
      return true;
    })
    .sort((a, b) => b.length - a.length);
  if (partial[0]) return partial[0];
  // 3) Mantıksal "Mutfak" vb. → POS-80C tercih
  return pickPreferredThermal(names) || t;
}

/** Aynı yazıcıda SetDefaultPrinter yarışı olmasın; farklı yazıcılar paralel basabilir */
const printChainsByPrinter = new Map();

async function handlePrint(html, printerName) {
  let list = [];
  try {
    list = await getWindowsPrinters();
  } catch {
    list = [];
  }
  const target = resolveWindowsPrinterName(printerName, list);
  const lockKey = (target || '__default__').toLowerCase();
  const prev = printChainsByPrinter.get(lockKey) || Promise.resolve();
  const run = async () => {
    console.log(
      `[print-agent] sessiz baskı (ExecWB) → ${target || '(varsayılan)'} (istek: ${printerName || '-'})`,
    );
    return printSilentWebBrowser(html, target);
  };
  const done = prev.then(run, run);
  printChainsByPrinter.set(
    lockKey,
    done.then(
      () => undefined,
      () => undefined,
    ),
  );
  return done;
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 8_000_000) {
        reject(new Error('body too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function pairPageHtml(query) {
  const ok = query.get('ok') === '1';
  const err = query.get('err') || '';
  return `<!DOCTYPE html>
<html lang="tr"><head><meta charset="utf-8"><title>ŞefPOS Yazıcı Ajanı</title>
<style>
  body{font-family:Segoe UI,system-ui,sans-serif;background:#0f172a;color:#e2e8f0;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}
  .card{background:#1e293b;border-radius:16px;padding:28px 32px;max-width:420px;box-shadow:0 20px 50px #0008}
  h1{font-size:1.25rem;margin:0 0 8px;color:#fb923c}
  p{margin:0 0 12px;line-height:1.45;color:#94a3b8;font-size:.95rem}
  .ok{color:#4ade80}.err{color:#f87171}
  code{background:#0f172a;padding:2px 6px;border-radius:6px;font-size:.85rem}
</style></head><body><div class="card">
  <h1>ŞefPOS Yazıcı Ajanı</h1>
  ${
    ok
      ? `<p class="ok">Bağlandı. Bu pencereyi kapatabilirsiniz.<br>Yazıcılar tarayıcıda birkaç saniye içinde görünür.</p>`
      : err
        ? `<p class="err">${err}</p>`
        : `<p>Oturum bekleniyor… ŞefPOS Ayarlar → Fiş &amp; Yazıcı → <b>Yazıcı ajanını bağla</b>.</p>
           <p>Ajan: <code>127.0.0.1:${PORT}</code></p>`
  }
</div></body></html>`;
}

function parseUrl(req) {
  return new URL(req.url || '/', `http://127.0.0.1:${PORT}`);
}

const server = http.createServer(async (req, res) => {
  _req = req;
  if (req.method === 'OPTIONS') {
    res.writeHead(200, corsHeaders());
    res.end();
    return;
  }

  const u = parseUrl(req);
  const pathname = u.pathname;

  if (pathname === '/status' && req.method === 'GET') {
    const session = readSession();
    sendJson(res, 200, {
      success: true,
      version: AGENT_VERSION,
      app: PRODUCT,
      platform: os.platform(),
      paired: !!session,
      agentToken: session ? ensureAgentToken() : null,
      installed: isInstalled(),
    });
    return;
  }

  if (pathname === '/printers' && req.method === 'GET') {
    if (!agentTokenOk(req)) {
      sendJson(res, 401, { success: false, error: 'Yazıcı ajanı eşleşmesi gerekli' });
      return;
    }
    const printers = await getWindowsPrinters();
    sendJson(res, 200, { success: true, printers });
    return;
  }

  if (pathname === '/pair' && req.method === 'GET') {
    const jwt = u.searchParams.get('jwt') || u.searchParams.get('token') || '';
    const tenantId = u.searchParams.get('tenant') || u.searchParams.get('tenantId') || '';
    const branchId = u.searchParams.get('branch') || u.searchParams.get('branchId') || '';
    const vdsOrigin = u.searchParams.get('vds') || DEFAULT_VDS_ORIGIN;

    if (jwt && tenantId) {
      try {
        const printers = await getWindowsPrinters();
        writeSession({
          userJwt: jwt,
          tenantId,
          branchId: branchId || null,
          vdsOrigin: allowedVdsOrigin(vdsOrigin),
          printers: printers.map((p) => ({ name: p.name, isDefault: !!p.isDefault })),
        });
        console.log(`[print-agent] eşlendi tenant=${tenantId} yazıcı=${printers.length}`);
        // trigger immediate register via short delay poller tick
        sendHtml(
          res,
          200,
          pairPageHtml(new URLSearchParams({ ok: '1' })),
        );
      } catch (err) {
        sendHtml(
          res,
          500,
          pairPageHtml(new URLSearchParams({ err: err.message || 'Kayıt hatası' })),
        );
      }
      return;
    }

    sendHtml(res, 200, pairPageHtml(u.searchParams));
    return;
  }

  if (pathname === '/session' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      if (!body.userJwt || !body.tenantId) {
        sendJson(res, 400, { success: false, error: 'userJwt ve tenantId gerekli' });
        return;
      }
      const printers = await getWindowsPrinters();
      writeSession({
        userJwt: body.userJwt,
        tenantId: body.tenantId,
        branchId: body.branchId || null,
        vdsOrigin: allowedVdsOrigin(body.vdsOrigin || DEFAULT_VDS_ORIGIN),
        printers: printers.map((p) => ({ name: p.name, isDefault: !!p.isDefault })),
      });
      sendJson(res, 200, { success: true, printers: printers.length });
    } catch (err) {
      sendJson(res, 500, { success: false, error: err.message });
    }
    return;
  }

  if (pathname === '/print' && req.method === 'POST') {
    if (!agentTokenOk(req)) {
      sendJson(res, 401, { success: false, error: 'Yazıcı ajanı eşleşmesi gerekli' });
      return;
    }
    try {
      const body = await readBody(req);
      if (!body.html) {
        sendJson(res, 400, { success: false, error: 'html gerekli' });
        return;
      }
      const result = await handlePrint(body.html, body.printerName || '');
      sendJson(res, 200, result);
    } catch (err) {
      sendJson(res, 500, { success: false, error: err.message });
    }
    return;
  }

  sendJson(res, 404, { success: false, error: 'Not found' });
});

function startAgentServer(quiet) {
  server.listen(PORT, '127.0.0.1', () => {
    if (!quiet) {
      console.log('');
      console.log(`  ${PRODUCT} çalışıyor`);
      console.log(`  http://127.0.0.1:${PORT}`);
      console.log(`  Oturum: ${getSessionPath()}`);
      console.log(`  Kurulum: ${getInstallDir()}`);
      console.log('  Tarayıcıda bir kez: Ayarlar → Fiş & Yazıcı → Yazıcı ajanını bağla');
      console.log('');
    } else {
      console.log(`[print-agent] ${PRODUCT} dinliyor :${PORT}`);
    }
    startQueuePoller({
      handlePrint,
      listPrinters: getWindowsPrinters,
    });
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      // Zaten çalışıyor = başarı (ikinci kopya sessizce çıksın)
      if (!quiet) console.log(`Port ${PORT} dolu — ajan zaten çalışıyor.`);
      process.exit(0);
    }
    console.error('Sunucu hatası:', err);
    process.exit(1);
  });
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--uninstall')) {
    uninstall();
    process.exit(0);
  }
  if (args.includes('--install')) {
    install({ notify: true, start: true });
    process.exit(0);
  }

  const protoIdx = args.indexOf('--protocol');
  if (protoIdx >= 0) {
    const raw = args[protoIdx + 1] || '';
    const r = handleProtocolUrl(raw);
    if (r.needListen) {
      showMsg('Ajan başlatılıyor… Eşleme kaydedildi. Birkaç saniye sonra yazdırabilirsiniz.');
      startAgentServer(true);
      return;
    }
    process.exit(r.ok ? 0 : 1);
  }
  // Bazı Windows sürümleri protokol argümanını tek parça verir
  const protoArg = args.find((a) => /^sefpos-print:/i.test(a));
  if (protoArg) {
    const r = handleProtocolUrl(protoArg);
    if (r.needListen) {
      startAgentServer(true);
      return;
    }
    process.exit(r.ok ? 0 : 1);
  }

  const daemon = args.includes('--daemon') || args.includes('--quiet');

  if (!daemon && !args.includes('--run')) {
    const gate = ensureInstalledOnFirstRun();
    if (gate.action === 'delegated-exit') {
      process.exit(0);
    }
    // installed-exit kaldırıldı → 'run' ile bu süreç dinler
  }

  appendLog(`startAgentServer daemon=${daemon} exe=${process.execPath}`);
  startAgentServer(daemon);
}

main();
