'use strict';

const http = require('http');
const { exec } = require('child_process');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

const execAsync = promisify(exec);
const PORT = 7878;

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };
}

function sendJson(res, statusCode, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(statusCode, corsHeaders());
  res.end(body);
}

async function getWindowsPrinters() {
  try {
    const ps = `Get-Printer | Select-Object Name,DriverName,PrinterStatus | ConvertTo-Json`;
    const { stdout } = await execAsync(`powershell -NoProfile -Command "${ps}"`, { timeout: 8000 });
    const raw = stdout.trim();
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const arr = Array.isArray(parsed) ? parsed : [parsed];
    return arr.map(p => ({
      name: p.Name || '',
      description: p.DriverName || '',
      status: p.PrinterStatus || 0,
      isDefault: false,
    }));
  } catch {
    return [];
  }
}

async function printHtml(html, printerName) {
  const tmpDir = os.tmpdir();
  const tmpFile = path.join(tmpDir, `shefpos_print_${Date.now()}.html`);

  const fullHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Courier New', monospace; font-size: 12px; width: 76mm; padding: 4px; }
  .center { text-align: center; }
  .bold { font-weight: bold; }
  .large { font-size: 14px; }
  .xlarge { font-size: 16px; }
  .line { border-top: 1px dashed #000; margin: 4px 0; }
  .row { display: flex; justify-content: space-between; width: 100%; }
  .name { flex: 1; overflow: hidden; }
  .qty { width: 36px; text-align: right; }
  .price { width: 80px; text-align: right; }
  .note { font-size: 11px; font-style: italic; padding-left: 8px; }
  .footer { text-align: center; font-size: 11px; margin-top: 4px; }
  .total-row { display: flex; justify-content: space-between; font-weight: bold; font-size: 14px; }
</style>
</head>
<body>
${html}
</body>
</html>`;

  fs.writeFileSync(tmpFile, fullHtml, 'utf8');

  try {
    let printCmd;

    if (printerName) {
      const escaped = printerName.replace(/"/g, '\\"');
      printCmd = `powershell -NoProfile -Command "` +
        `$ie = New-Object -ComObject InternetExplorer.Application; ` +
        `$ie.Visible = $false; ` +
        `$ie.Navigate('file:///${tmpFile.replace(/\\/g, '/')}'); ` +
        `Start-Sleep -Milliseconds 2000; ` +
        `$ie.ExecWB(6, 2); ` +
        `Start-Sleep -Milliseconds 3000; ` +
        `$ie.Quit()"`;

      printCmd = `powershell -NoProfile -Command "` +
        `$settings = New-Object System.Management.Automation.Host.ChoiceDescription; ` +
        `Start-Process -FilePath 'rundll32.exe' -ArgumentList 'mshtml.dll,PrintHTML \\"file:///${tmpFile.replace(/\\/g, '/')}\\"' -Wait"`;

      printCmd = `powershell -NoProfile -Command "` +
        `$doc = [System.IO.File]::ReadAllText('${tmpFile}'); ` +
        `$printJob = Start-Process -FilePath 'C:\\Windows\\System32\\rundll32.exe' ` +
        `-ArgumentList 'printui.dll,PrintUIEntry /p /n \\"${escaped}\\"' -PassThru -Wait"`;

      printCmd = buildPrintScript(tmpFile, escaped);
    } else {
      printCmd = buildPrintScript(tmpFile, null);
    }

    await execAsync(printCmd, { timeout: 20000 });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  } finally {
    try { fs.unlinkSync(tmpFile); } catch {}
  }
}

function buildPrintScript(htmlFile, printerName) {
  const filePath = htmlFile.replace(/\\/g, '/');

  if (printerName) {
    return `powershell -NoProfile -Command "` +
      `$shell = New-Object -ComObject Shell.Application; ` +
      `Add-Type -AssemblyName System.Drawing; ` +
      `$ps = New-Object System.Drawing.Printing.PrintDocument; ` +
      `$ps.PrinterSettings.PrinterName = '${printerName}'; ` +
      `$proc = Start-Process -FilePath 'mshta.exe' ` +
      `-ArgumentList 'javascript:print();close()' -PassThru; ` +
      `Start-Sleep 1; Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue"`;
  }

  return `powershell -NoProfile -Command "` +
    `Start-Process -FilePath 'rundll32.exe' ` +
    `-ArgumentList 'mshtml.dll,PrintHTML \\"file:///${filePath}\\"' -Wait"`;
}

async function printWithChrome(html, printerName) {
  const tmpDir = os.tmpdir();
  const tmpFile = path.join(tmpDir, `shefpos_print_${Date.now()}.html`);

  const fullHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Courier New', monospace; font-size: 12px; width: 76mm; padding: 4px; }
  .center { text-align: center; }
  .bold { font-weight: bold; }
  .large { font-size: 14px; }
  .xlarge { font-size: 16px; }
  .line { border-top: 1px dashed #000; margin: 4px 0; }
  .row { display: flex; justify-content: space-between; width: 100%; }
  .name { flex: 1; overflow: hidden; }
  .qty { width: 36px; text-align: right; }
  .price { width: 80px; text-align: right; }
  .note { font-size: 11px; font-style: italic; padding-left: 8px; }
  .footer { text-align: center; font-size: 11px; margin-top: 4px; }
  .total-row { display: flex; justify-content: space-between; font-weight: bold; font-size: 14px; }
  @media print {
    @page { margin: 0; size: 80mm auto; }
  }
</style>
</head>
<body>
${html}
<script>window.onload = function() { window.print(); setTimeout(function(){ window.close(); }, 2000); }</script>
</body>
</html>`;

  fs.writeFileSync(tmpFile, fullHtml, 'utf8');

  const chromePaths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
  ];

  const edgePaths = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ];

  let browserPath = null;

  for (const p of [...chromePaths, ...edgePaths]) {
    if (fs.existsSync(p)) {
      browserPath = p;
      break;
    }
  }

  if (!browserPath) {
    try {
      fs.unlinkSync(tmpFile);
    } catch {}
    return { success: false, error: 'Chrome veya Edge bulunamadi' };
  }

  try {
    const printerArg = printerName ? `--kiosk-printing --printer="${printerName}"` : `--kiosk-printing`;
    const cmd = `"${browserPath}" --headless --disable-gpu ${printerArg} --print-to-pdf-no-header "file:///${tmpFile.replace(/\\/g, '/')}"`;

    const printerName2 = printerName || '';
    const script = printerName2
      ? `"${browserPath}" --headless=new --disable-gpu --print-to-printer="${printerName2}" --no-margins "file:///${tmpFile.replace(/\\/g, '/')}"`
      : `"${browserPath}" --headless=new --disable-gpu --print-to-default-printer --no-margins "file:///${tmpFile.replace(/\\/g, '/')}"`;

    await execAsync(script, { timeout: 20000 });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  } finally {
    try { fs.unlinkSync(tmpFile); } catch {}
  }
}

async function printWithPowerShell(html, printerName) {
  const tmpDir = os.tmpdir();
  const tmpHtml = path.join(tmpDir, `shefpos_${Date.now()}.html`);
  const tmpPs1 = path.join(tmpDir, `shefpos_${Date.now()}.ps1`);

  const fullHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'Courier New', monospace; font-size: 12px; width: 76mm; padding: 4px; }
.center { text-align: center; }
.bold { font-weight: bold; }
.large { font-size: 14px; }
.xlarge { font-size: 16px; }
.line { border-top: 1px dashed #000; margin: 4px 0; }
.row { display: flex; justify-content: space-between; }
.name { flex: 1; }
.qty { width: 36px; text-align: right; }
.price { width: 80px; text-align: right; }
.note { font-size: 11px; font-style: italic; }
.footer { text-align: center; font-size: 11px; }
.total-row { display: flex; justify-content: space-between; font-weight: bold; font-size: 14px; }
</style></head><body>${html}</body></html>`;

  fs.writeFileSync(tmpHtml, fullHtml, 'utf8');

  const fileUrl = `file:///${tmpHtml.replace(/\\/g, '/')}`;
  const printerLine = printerName ? `$wb.Document.PrinterSettings.PrinterName = '${printerName.replace(/'/g, "''")}';` : '';

  const psScript = `
Add-Type -AssemblyName System.Windows.Forms
$wb = New-Object System.Windows.Forms.WebBrowser
$wb.ScriptErrorsSuppressed = $true
$wb.Width = 300
$wb.Height = 800
$wb.Navigate('${fileUrl}')
$timeout = 0
while ($wb.ReadyState -ne 4 -and $timeout -lt 50) {
  [System.Windows.Forms.Application]::DoEvents()
  Start-Sleep -Milliseconds 100
  $timeout++
}
Start-Sleep -Milliseconds 500
${printerLine}
$wb.ShowPrintDialog = $false
$wb.Print()
Start-Sleep -Milliseconds 3000
$wb.Dispose()
`;

  fs.writeFileSync(tmpPs1, psScript, 'utf8');

  try {
    await execAsync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${tmpPs1}"`, { timeout: 30000 });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  } finally {
    try { fs.unlinkSync(tmpHtml); } catch {}
    try { fs.unlinkSync(tmpPs1); } catch {}
  }
}

async function handlePrint(html, printerName) {
  const result = await printWithPowerShell(html, printerName);
  return result;
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(data)); }
      catch { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(200, corsHeaders());
    res.end();
    return;
  }

  const url = req.url.split('?')[0];

  if (url === '/status' && req.method === 'GET') {
    sendJson(res, 200, { success: true, version: '1.0.0', platform: os.platform() });
    return;
  }

  if (url === '/printers' && req.method === 'GET') {
    const printers = await getWindowsPrinters();
    sendJson(res, 200, { success: true, printers });
    return;
  }

  if (url === '/print' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const { html, printerName } = body;

      if (!html) {
        sendJson(res, 400, { success: false, error: 'html gerekli' });
        return;
      }

      const result = await handlePrint(html, printerName || '');
      sendJson(res, 200, result);
    } catch (err) {
      sendJson(res, 500, { success: false, error: err.message });
    }
    return;
  }

  sendJson(res, 404, { success: false, error: 'Not found' });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`ShefPOS Print Agent calisiyor: http://127.0.0.1:${PORT}`);
  console.log('Web tarayicinizda ShefPOS acik oldugunda otomatik yazdir.');
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} zaten kullaniliyor. Print Agent zaten acik olabilir.`);
    process.exit(1);
  }
  console.error('Sunucu hatasi:', err);
});
