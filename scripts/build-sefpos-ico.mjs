/**
 * Yuvarlak ŞefPOS logosundan (public/logo.png) çok çözünürlüklü Windows .ico
 * üretir → public/SEFPOS.ico üzerine yazar.
 *
 * Niye? electron-builder Windows EXE / NSIS / taskbar simgesi için çoklu
 * çözünürlük içeren bir .ico dosyasına ihtiyaç duyuyor. logo.png 256x256
 * olduğundan, png-to-ico kütüphanesi varsayılan olarak 16/24/32/48/64/128/256
 * boyutlarını üretir.
 */
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pngToIco from 'png-to-ico';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

const sourcePng = path.join(projectRoot, 'public', 'logo.png');
const targetIco = path.join(projectRoot, 'public', 'SEFPOS.ico');

const buf = await pngToIco(sourcePng);
await writeFile(targetIco, buf);
console.log(`OK: ${targetIco} (${buf.length} bytes) ← ${sourcePng}`);
