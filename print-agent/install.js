'use strict';

/**
 * Bir kez kurulum: %LOCALAPPDATA%\SefPOS\PrintAgent\
 * Görünür sihirbaz (İleri / Bitir) + Windows açılışında gizli çalışır.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawn, spawnSync } = require('child_process');

const RUN_VALUE_NAME = 'SefPOSPrintAgent';
const TASK_NAME = 'SefPOS Yazici Ajani';
const PRODUCT = 'ŞefPOS Yazıcı Ajanı';
const PORT = 7878;

function getInstallDir() {
  const base = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  return path.join(base, 'SefPOS', 'PrintAgent');
}

function getInstalledExePath() {
  return path.join(getInstallDir(), 'Sefpos-PrintAgent.exe');
}

function getHiddenStarterPath() {
  return path.join(getInstallDir(), 'start-hidden.vbs');
}

function getMarkerPath() {
  return path.join(getInstallDir(), 'installed.json');
}

function getCurrentExePath() {
  return process.execPath;
}

function isRunningFromInstallDir() {
  try {
    return path.resolve(getCurrentExePath()).toLowerCase() === path.resolve(getInstalledExePath()).toLowerCase();
  } catch {
    return false;
  }
}

function isInstalled() {
  try {
    return fs.existsSync(getInstalledExePath()) && fs.existsSync(getMarkerPath());
  } catch {
    return false;
  }
}

function writeHiddenVbs(exePath, vbsPath) {
  const content =
    'Set sh = CreateObject("WScript.Shell")\r\n' +
    `sh.Run """${exePath}"" --daemon", 0, False\r\n`;
  fs.writeFileSync(vbsPath, content, 'utf8');
}

function registerProtocol(exePath) {
  // sefpos-print://pair?... → ajan kapalı olsa bile Windows EXE'yi açar (Bağla çalışır)
  const cmd = `"${exePath}" --protocol "%1"`;
  const ps = [
    `$root = 'HKCU:\\Software\\Classes\\sefpos-print'`,
    `New-Item -Path $root -Force | Out-Null`,
    `Set-ItemProperty -Path $root -Name '(Default)' -Value 'URL:SefPOS Print Agent'`,
    `Set-ItemProperty -Path $root -Name 'URL Protocol' -Value ''`,
    `New-Item -Path \"$root\\shell\\open\\command\" -Force | Out-Null`,
    `Set-ItemProperty -Path \"$root\\shell\\open\\command\" -Name '(Default)' -Value ${JSON.stringify(cmd)}`,
  ].join('; ');
  try {
    execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], {
      windowsHide: true,
      stdio: 'ignore',
    });
  } catch {
    /* ignore */
  }
}

function appendLog(line) {
  try {
    const logPath = path.join(getInstallDir(), 'agent.log');
    fs.mkdirSync(getInstallDir(), { recursive: true });
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${line}\r\n`, 'utf8');
  } catch {
    /* ignore */
  }
}

function setRunKey(command) {
  const ps = [
    `$p = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'`,
    `New-Item -Path $p -Force | Out-Null`,
    `Set-ItemProperty -Path $p -Name '${RUN_VALUE_NAME}' -Value ${JSON.stringify(command)} -Type String -Force`,
  ].join('; ');
  execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], {
    windowsHide: true,
    stdio: 'ignore',
  });
}

function removeRunKey() {
  try {
    execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        `Remove-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run' -Name '${RUN_VALUE_NAME}' -ErrorAction SilentlyContinue`,
      ],
      { windowsHide: true, stdio: 'ignore' },
    );
  } catch {
    /* ignore */
  }
}

function registerLogonTask(vbsPath) {
  const tr = `wscript.exe //B //Nologo "${vbsPath}"`;
  try {
    execFileSync(
      'schtasks.exe',
      ['/Create', '/TN', TASK_NAME, '/TR', tr, '/SC', 'ONLOGON', '/RL', 'LIMITED', '/F'],
      { windowsHide: true, stdio: 'ignore' },
    );
  } catch {
    /* Run key yeterli */
  }
}

function unregisterLogonTask() {
  try {
    execFileSync('schtasks.exe', ['/Delete', '/TN', TASK_NAME, '/F'], {
      windowsHide: true,
      stdio: 'ignore',
    });
  } catch {
    /* ignore */
  }
}

function waitForAgent(timeoutMs = 12000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const ok = spawnSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-Command',
          `try { (Invoke-WebRequest -Uri 'http://127.0.0.1:${PORT}/status' -UseBasicParsing -TimeoutSec 2).StatusCode } catch { 0 }`,
        ],
        { windowsHide: true, encoding: 'utf8' },
      );
      if (String(ok.stdout || '').includes('200')) return true;
    } catch {
      /* retry */
    }
    spawnSync('powershell.exe', ['-NoProfile', '-Command', 'Start-Sleep -Milliseconds 500'], {
      windowsHide: true,
    });
  }
  return false;
}

function startDaemonNow() {
  const exe = getInstalledExePath();
  const vbs = getHiddenStarterPath();
  // 1) Doğrudan EXE --daemon (en güvenilir)
  try {
    spawn(exe, ['--daemon'], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      cwd: getInstallDir(),
    }).unref();
  } catch {
    /* ignore */
  }
  // 2) VBS yedek
  try {
    spawn('wscript.exe', ['//B', '//Nologo', vbs], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    }).unref();
  } catch {
    /* ignore */
  }
}

/** Senkron, görünür kurulum sihirbazı (İleri / Bitir). */
function showSetupWizard(opts) {
  const wizardPs1 = path.join(os.tmpdir(), `sefpos-print-setup-${Date.now()}.ps1`);
  const cleanScript = buildWizardScript({
    title: PRODUCT,
    already: !!opts.alreadyInstalled,
    alive: !!opts.agentAlive,
    err: opts.error || '',
    dir: opts.dir || getInstallDir(),
  });
  fs.writeFileSync(wizardPs1, cleanScript, 'utf8');
  try {
    execFileSync(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', wizardPs1],
      { windowsHide: false, stdio: 'ignore' },
    );
  } catch {
    /* ignore */
  } finally {
    try {
      fs.unlinkSync(wizardPs1);
    } catch {
      /* ignore */
    }
  }
}

function buildWizardScript(o) {
  const lines = [];
  const T = (s) =>
    String(s)
      .replace(/\r/g, '')
      .split('\n')
      .map((x) => x.replace(/'/g, "''"))
      .join("' + [char]10 + '");

  lines.push(`Add-Type -AssemblyName System.Windows.Forms`);
  lines.push(`Add-Type -AssemblyName System.Drawing`);
  lines.push(`$form = New-Object System.Windows.Forms.Form`);
  lines.push(`$form.Text = '${T(o.title)}'`);
  lines.push(`$form.Size = New-Object System.Drawing.Size(540, 380)`);
  lines.push(`$form.StartPosition = 'CenterScreen'`);
  lines.push(`$form.FormBorderStyle = 'FixedDialog'`);
  lines.push(`$form.MaximizeBox = $false`);
  lines.push(`$form.MinimizeBox = $false`);
  lines.push(`$form.TopMost = $true`);
  lines.push(`$form.BackColor = [System.Drawing.Color]::FromArgb(15,23,42)`);

  lines.push(`$lblTitle = New-Object System.Windows.Forms.Label`);
  lines.push(`$lblTitle.ForeColor = [System.Drawing.Color]::FromArgb(251,146,60)`);
  lines.push(`$lblTitle.Font = New-Object System.Drawing.Font('Segoe UI', 14, [System.Drawing.FontStyle]::Bold)`);
  lines.push(`$lblTitle.Location = New-Object System.Drawing.Point(24, 18)`);
  lines.push(`$lblTitle.Size = New-Object System.Drawing.Size(480, 32)`);
  lines.push(`$lblTitle.Text = '${T(o.title)}'`);
  lines.push(`$form.Controls.Add($lblTitle)`);

  lines.push(`$lbl = New-Object System.Windows.Forms.Label`);
  lines.push(`$lbl.ForeColor = [System.Drawing.Color]::FromArgb(226,232,240)`);
  lines.push(`$lbl.Font = New-Object System.Drawing.Font('Segoe UI', 10)`);
  lines.push(`$lbl.Location = New-Object System.Drawing.Point(24, 64)`);
  lines.push(`$lbl.Size = New-Object System.Drawing.Size(480, 200)`);

  let page1;
  let page2;
  if (o.already) {
    page1 = o.alive
      ? 'Bu bilgisayarda zaten kurulu.\n\nAjan arka planda ÇALIŞIYOR.\n\nYazdırma yapmıyorsa tarayıcıda bir kez:\nŞefPOS → Ayarlar → Fiş & Yazıcı → «Yazıcı ajanını bağla»\n\nSonra Bitir.'
      : 'Bu bilgisayarda kurulu.\n\nAjan şimdi başlatıldı.\nBirkaç saniye bekleyip tarayıcıda «Yazıcı ajanını bağla» deyin.\n\nSonra Bitir.';
    page2 = page1;
  } else {
    page1 =
      'Adım 1 / 2 — Kurulum\n\nBu program bir kez kurulur.\nWindows her açıldığında otomatik (gizli) çalışır.\n\nTam ŞefPOS masaüstü (Electron) gerekmez.\n\n«İleri»ye basın.';
    if (o.err) {
      page2 = `Adım 2 / 2 — Uyarı\n\nDosyalar kuruldu ama ajan yanıt vermedi:\n${o.err}\n\nAntivirüs engelliyor olabilir.\nEXE'yi tekrar çalıştırın.\n\nKlasör:\n${o.dir}`;
    } else if (o.alive) {
      page2 =
        'Adım 2 / 2 — Tamam\n\nAjan çalışıyor ✓\n\nŞimdi tarayıcıda bir kez:\nŞefPOS → Ayarlar → Fiş & Yazıcı\n→ «Yazıcı ajanını bağla»\n\nBundan sonra yazdırma çalışır.\nPC her açılışta ajan kendisi gelir.';
    } else {
      page2 = `Adım 2 / 2\n\nKurulum yazıldı.\nAjan henüz yanıt vermedi — Bitir deyip EXE'yi bir kez daha açın.\n\n${o.dir}`;
    }
  }

  lines.push(`$script:page1 = '${T(page1)}'`);
  lines.push(`$script:page2 = '${T(page2)}'`);
  lines.push(`$lbl.Text = $script:page1`);
  lines.push(`$form.Controls.Add($lbl)`);

  lines.push(`$btn = New-Object System.Windows.Forms.Button`);
  lines.push(`$btn.Text = '${o.already ? 'Bitir' : 'İleri'}'`);
  lines.push(`$btn.Font = New-Object System.Drawing.Font('Segoe UI', 10, [System.Drawing.FontStyle]::Bold)`);
  lines.push(`$btn.Size = New-Object System.Drawing.Size(120, 38)`);
  lines.push(`$btn.Location = New-Object System.Drawing.Point(380, 285)`);
  lines.push(`$btn.BackColor = [System.Drawing.Color]::FromArgb(234,88,12)`);
  lines.push(`$btn.ForeColor = [System.Drawing.Color]::White`);
  lines.push(`$btn.FlatStyle = 'Flat'`);
  lines.push(`$script:step = 1`);
  lines.push(`$btn.Add_Click({`);
  if (o.already) {
    lines.push(`  $form.Close()`);
  } else {
    lines.push(`  if ($script:step -eq 1) { $lbl.Text = $script:page2; $btn.Text = 'Bitir'; $script:step = 2; return }`);
    lines.push(`  $form.Close()`);
  }
  lines.push(`})`);
  lines.push(`$form.Controls.Add($btn)`);
  lines.push(`[void]$form.ShowDialog()`);
  return lines.join('\r\n');
}

function installCore() {
  const dir = getInstallDir();
  fs.mkdirSync(dir, { recursive: true });
  const destExe = getInstalledExePath();
  const vbs = getHiddenStarterPath();
  const src = getCurrentExePath();

  if (path.resolve(src).toLowerCase() !== path.resolve(destExe).toLowerCase()) {
    try {
      fs.copyFileSync(src, destExe);
    } catch (e) {
      // Kilitliyse geçici kopya
      const tmp = destExe + '.new';
      fs.copyFileSync(src, tmp);
      try {
        if (fs.existsSync(destExe)) fs.unlinkSync(destExe);
      } catch {
        /* */
      }
      try {
        fs.renameSync(tmp, destExe);
      } catch {
        fs.copyFileSync(tmp, destExe);
        try {
          fs.unlinkSync(tmp);
        } catch {
          /* */
        }
      }
    }
  }

  writeHiddenVbs(destExe, vbs);
  setRunKey(`wscript.exe //B //Nologo "${vbs}"`);
  registerLogonTask(vbs);
  registerProtocol(destExe);
  fs.writeFileSync(
    getMarkerPath(),
    JSON.stringify(
      {
        installedAt: new Date().toISOString(),
        version: '1.3.0',
        exe: destExe,
        product: PRODUCT,
      },
      null,
      2,
    ),
    'utf8',
  );
  appendLog('installCore ok');
  return dir;
}

function install(opts = {}) {
  const dir = installCore();
  if (opts.start !== false) startDaemonNow();
  const alive = opts.start !== false ? waitForAgent(14000) : false;
  if (opts.notify !== false) {
    showSetupWizard({ alreadyInstalled: false, agentAlive: alive, dir, error: alive ? '' : 'http://127.0.0.1:7878 yanıt yok' });
  }
  return { ok: true, dir, alive };
}

function uninstall() {
  removeRunKey();
  unregisterLogonTask();
  try {
    if (fs.existsSync(getHiddenStarterPath())) fs.unlinkSync(getHiddenStarterPath());
    if (fs.existsSync(getMarkerPath())) fs.unlinkSync(getMarkerPath());
  } catch {
    /* ignore */
  }
  try {
    execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.MessageBox]::Show('ŞefPOS Yazıcı Ajanı kaldırıldı (otomatik başlatma kapalı).','ŞefPOS', 'OK', 'Information')`,
      ],
      { windowsHide: false },
    );
  } catch {
    /* */
  }
  return { ok: true };
}

/**
 * Çift tık: kur + bu süreçte sunucuyu AÇIK tut (Bağla hemen çalışsın).
 * --daemon: sadece gizli dinle.
 */
function ensureInstalledOnFirstRun() {
  if (!process.pkg) return { action: 'run' };

  // Marker yoksa yeniden yaz
  if (fs.existsSync(getInstalledExePath()) && !fs.existsSync(getMarkerPath())) {
    try {
      installCore();
    } catch {
      /* ignore */
    }
  }

  if (!isInstalled()) {
    const dir = installCore();
    startDaemonNow();
    const alive = waitForAgent(8000);
    showSetupWizard({
      alreadyInstalled: false,
      agentAlive: alive,
      dir,
      error: alive ? '' : 'http://127.0.0.1:7878 yanıt yok — Bitir sonrası bu pencere ajanı açık tutacak',
    });
    // Kritik: kurulumdan sonra BU süreç dinlesin (spawn bazen ölüyor)
    appendLog('first-run → run in-process after install');
    return { action: 'run' };
  }

  // Güncelleme: Downloads EXE → install dir'e kopyala
  if (!isRunningFromInstallDir()) {
    try {
      installCore();
    } catch (e) {
      appendLog('update copy fail ' + (e && e.message));
    }
  }

  startDaemonNow();
  const alive = waitForAgent(6000);
  showSetupWizard({ alreadyInstalled: true, agentAlive: alive, dir: getInstallDir() });
  // Ajan zaten ayaktaysa çık; değilse bu süreç dinlesin
  if (alive) {
    appendLog('already installed + alive → exit');
    return { action: 'delegated-exit' };
  }
  appendLog('already installed but dead → run in-process');
  return { action: 'run' };
}

module.exports = {
  PRODUCT,
  getInstallDir,
  getInstalledExePath,
  isInstalled,
  isRunningFromInstallDir,
  install,
  uninstall,
  ensureInstalledOnFirstRun,
  startDaemonNow,
  waitForAgent,
  registerProtocol,
  appendLog,
};
