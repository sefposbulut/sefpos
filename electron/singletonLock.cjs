/**
 * Windows: yanlışlıkla birden fazla ana Sefpos.exe açılmasını azaltır.
 * Chromium alt süreçleri (--type=gpu-process vb.) dokunulmaz; yalnızca
 * komut satırında --type= olmayan (ana) süreçler hedeflenir.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

function lockFilePath() {
  const base = process.env.LOCALAPPDATA || os.tmpdir();
  return path.join(base, 'Sefpos', 'main-instance.lock');
}

function readLockPid(lockPath) {
  try {
    const n = parseInt(String(fs.readFileSync(lockPath, 'utf8')).trim(), 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** true = bu süreç ana örnek olarak kilidi aldı */
function acquireMainInstanceFileLock() {
  const lockPath = lockFilePath();
  try {
    fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  } catch {
    /* */
  }

  const existing = readLockPid(lockPath);
  if (existing && existing !== process.pid && isPidAlive(existing)) {
    return false;
  }
  if (existing && !isPidAlive(existing)) {
    try {
      fs.unlinkSync(lockPath);
    } catch {
      /* */
    }
  }

  try {
    const fd = fs.openSync(lockPath, 'wx');
    fs.writeFileSync(fd, String(process.pid), 'utf8');
    fs.closeSync(fd);
  } catch (e) {
    if (e && e.code === 'EEXIST') {
      const again = readLockPid(lockPath);
      if (again && again !== process.pid && isPidAlive(again)) return false;
      try {
        fs.unlinkSync(lockPath);
      } catch {
        return false;
      }
      return acquireMainInstanceFileLock();
    }
    return false;
  }

  const release = () => {
    try {
      const cur = readLockPid(lockPath);
      if (cur === process.pid) fs.unlinkSync(lockPath);
    } catch {
      /* */
    }
  };
  process.on('exit', release);
  return true;
}

function registerReleaseOnAppQuit(appRef) {
  if (!appRef || typeof appRef.on !== 'function') return;
  appRef.on('will-quit', () => {
    try {
      const lockPath = lockFilePath();
      const cur = readLockPid(lockPath);
      if (cur === process.pid) fs.unlinkSync(lockPath);
    } catch {
      /* */
    }
  });
}

function terminateOtherMainSefposProcesses() {
  if (process.platform !== 'win32') return;
  const myPid = process.pid;
  const ps = [
    'Get-CimInstance Win32_Process -Filter "Name=\'Sefpos.exe\'" |',
    `Where-Object { $_.ProcessId -ne ${myPid} -and $_.CommandLine -and ($_.CommandLine -notmatch '--type=') } |`,
    'ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }',
  ].join(' ');
  try {
    execSync(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${ps}"`, {
      stdio: 'ignore',
      timeout: 12000,
      windowsHide: true,
    });
  } catch {
    /* */
  }
}

module.exports = {
  acquireMainInstanceFileLock,
  registerReleaseOnAppQuit,
  terminateOtherMainSefposProcesses,
};
