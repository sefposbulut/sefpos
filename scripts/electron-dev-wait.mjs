/**
 * sefpos-dev-port.json içindeki portta Vite'ın ayağa kalkmasını bekler, sonra Electron başlatır.
 * package.json "electron:dev" ikinci parça olarak çalışır.
 */
import { readFileSync } from 'node:fs';
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

const npxPath = process.platform === 'win32'
  ? join(dirname(process.execPath), 'npx.cmd')
  : 'npx';
const child = process.platform === 'win32'
  ? spawn(process.env.ComSpec || 'cmd.exe', ['/c', npxPath, '--yes', 'electron', '.'], {
      cwd: root,
      stdio: 'inherit',
      shell: false,
      env: { ...process.env, NODE_ENV: 'development' },
    })
  : spawn(npxPath, ['--yes', 'electron', '.'], {
      cwd: root,
      stdio: 'inherit',
      shell: false,
      env: { ...process.env, NODE_ENV: 'development' },
    });

child.on('exit', (code, signal) => {
  if (signal) process.exit(1);
  process.exit(code ?? 0);
});
child.on('error', (err) => {
  console.error(err);
  process.exit(1);
});
