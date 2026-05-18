/**
 * Cloudflare Pages kökünde (https://www.sefpos.com.tr/) çalışması için
 * dist/index.html içinde ./ tabanlı asset yolları OLMAMALI.
 * Yanlışlıkla `npm run build` (Electron uyumlu ./) deploy edilirse fail.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const indexPath = path.join(root, 'dist', 'index.html');

let html;
try {
  html = fs.readFileSync(indexPath, 'utf8');
} catch {
  console.error('[assert-web-pages-dist] dist/index.html bulunamadı. Önce npm run build:pages çalıştırın.');
  process.exit(1);
}

const bad = [];
if (html.includes('src="./assets/')) bad.push('script src="./assets/');
if (html.includes('href="./assets/')) bad.push('link href="./assets/');
if (/<base\s+href="\.\/"/i.test(html)) bad.push('<base href="./" />');

if (bad.length) {
  console.error('[assert-web-pages-dist] Web kökü için geçersiz dist:');
  bad.forEach((b) => console.error('  -', b));
  console.error('\nÇözüm: npm run build:pages kullanın (CF_PAGES=1).');
  console.error('Cloudflare Pages → Build command: npm run build:pages');
  process.exit(1);
}

if (!html.includes('src="/assets/')) {
  console.warn('[assert-web-pages-dist] /assets/ bekleniyordu; yine de devam (özel base?).');
}

const workerPath = path.join(root, 'dist', '_worker.js');
if (!fs.existsSync(workerPath)) {
  console.error('[assert-web-pages-dist] dist/_worker.js eksik (public/_worker.js → build:pages ile kopyalanmalı).');
  process.exit(1);
}

console.log('[assert-web-pages-dist] OK');
