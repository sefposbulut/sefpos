/**
 * package.json sürümünü Android versionName / versionCode ile senkronlar.
 * Kullanım: node scripts/sync-mobile-version.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = String(pkg.version || '1.0.0');
const parts = version.split('.').map((n) => parseInt(n, 10) || 0);
const versionCode = parts[0] * 10_000 + parts[1] * 100 + parts[2];

const gradlePath = path.join(root, 'android', 'app', 'build.gradle');
let gradle = fs.readFileSync(gradlePath, 'utf8');
gradle = gradle.replace(/versionCode\s+\d+/, `versionCode ${versionCode}`);
gradle = gradle.replace(/versionName\s+"[^"]*"/, `versionName "${version}"`);
fs.writeFileSync(gradlePath, gradle);
console.log(`[sync-mobile-version] Android → versionName ${version}, versionCode ${versionCode}`);
