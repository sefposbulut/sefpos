#!/usr/bin/env node
/**
 * Adım 1 doğrulama: Vite pre-bundle (lucide) + dev sunucu yanıtı.
 * Kullanım: node scripts/verify-dev-perf.mjs
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const portFile = join(root, 'sefpos-dev-port.json');
let port = 5180;
try {
  const j = JSON.parse(readFileSync(portFile, 'utf8'));
  if (Number.isInteger(j.port)) port = j.port;
} catch {
  /* default */
}

const lucideBundle = join(root, 'node_modules', '.vite', 'deps', 'lucide-react.js');
const metaPath = join(root, 'node_modules', '.vite', 'deps', '_metadata.json');

console.log('=== ŞefPOS dev perf doğrulama ===\n');

if (existsSync(lucideBundle)) {
  const kb = Math.round(readFileSync(lucideBundle).length / 1024);
  console.log(`[OK] lucide-react pre-bundle: ${kb} KB (tek istek — 1500+ ikon dosyası yok)`);
} else {
  console.log('[!!] lucide-react pre-bundle YOK — npm run dev öncesi: npx vite optimize --force');
}

if (existsSync(metaPath)) {
  const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
  const keys = Object.keys(meta.optimized || {});
  console.log(`[OK] optimizeDeps: ${keys.length} paket (${keys.includes('lucide-react') ? 'lucide dahil' : 'lucide EKSİK'})`);
} else {
  console.log('[!!] .vite/deps/_metadata.json yok — dev sunucuyu bir kez başlatın');
}

const base = `http://127.0.0.1:${port}`;
try {
  const res = await fetch(base, { signal: AbortSignal.timeout(8000) });
  const html = await res.text();
  const moduleScripts = (html.match(/type="module"/g) || []).length;
  console.log(`[OK] Dev sunucu ${base} — index module script: ${moduleScripts}`);
  console.log('\nDevTools: Network → Clear → yenile → JS istek sayısı ~50–120 olmalı (1750 değil).');
  console.log('Supabase için: Network filtresi Fetch/XHR');
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e);
  console.log(`[!!] Dev sunucu ${base} yanıt vermiyor: ${msg}`);
  console.log('   Çalıştır: npm run electron:dev');
  process.exit(1);
}
