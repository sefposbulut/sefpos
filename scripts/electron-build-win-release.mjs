/**
 * Windows: Sefpos.exe kapat + release\win-unpacked sil → vite build → electron-builder --win
 * Çıktı her zaman package.json → build.directories.output (release) = C:\sefpos\release
 */
import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const unpacked = path.join(root, 'release', 'win-unpacked');

if (process.platform === 'win32') {
  try {
    execSync('taskkill /F /IM Sefpos.exe /T', { stdio: 'ignore' });
  } catch {
    /* süreç yok */
  }
  try {
    fs.rmSync(unpacked, { recursive: true, force: true });
  } catch {
    /* kilitliyse electron-builder yine dener */
  }
}

const shell = process.platform === 'win32';
const b = spawnSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit', shell });
if (b.status !== 0) process.exit(b.status ?? 1);

const e = spawnSync('npx', ['electron-builder', '--win'], { cwd: root, stdio: 'inherit', shell });
process.exit(e.status ?? 1);
