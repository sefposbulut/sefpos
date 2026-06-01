/**
 * sefpos-dev-port.json içindeki portta Vite'ın ayağa kalkmasını bekler, sonra Electron başlatır.
 * package.json "electron:dev" ikinci parça olarak çalışır.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function readPort() {
  try {
    const j = JSON.parse(readFileSync(join(root, 'sefpos-dev-port.json'), 'utf8'));
    const n = Number(j.port);
    if (Number.isInteger(n) && n >= 1 && n <= 65535) return n;
  } catch {
    /* ignore */
  }
  return 5180;
}

const port = readPort();
const { default: waitOn } = await import('wait-on');

await waitOn({
  resources: [`http-get://127.0.0.1:${port}`],
  timeout: 120_000,
});

function resolveElectronBin() {
  const win = join(root, 'node_modules', '.bin', 'electron.cmd');
  const unix = join(root, 'node_modules', '.bin', 'electron');
  if (process.platform === 'win32' && existsSync(win)) return win;
  if (existsSync(unix)) return unix;
  return null;
}

const electronBin = resolveElectronBin();
if (!electronBin) {
  console.error('[electron:dev] electron bulunamadı. Önce npm install çalıştırın.');
  process.exit(1);
}

// Vite HMR unsafe-eval gerektirir; üretim EXE'de electron/csp.cjs sıkı CSP uygular.
const child = spawn(electronBin, ['.'], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: {
    ...process.env,
    NODE_ENV: 'development',
    ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
  },
});

child.on('exit', (code, signal) => {
  if (signal) process.exit(1);
  process.exit(code ?? 0);
});
child.on('error', (err) => {
  console.error(err);
  process.exit(1);
});
