/**
 * electron-builder afterPack hook.
 *
 * Sefpos.exe'ye yuvarlak ŞefPOS iconunu (public/SEFPOS.ico) gömer.
 *
 * Niye? electron-builder'ın yerleşik rcedit adımı (`signAndEditExecutable: true`)
 * winCodeSign aracını indirip açmaya çalışıyor; bu araçtaki darwin sembolik
 * linkleri Windows'ta Developer Mode/yönetici hakkı olmadan açılamıyor ve
 * build çöküyor. Onun yerine bu hook, electron-winstaller ile birlikte gelen
 * standalone `rcedit.exe`'yi çağırarak iconu gömer; symlink ihtiyacı yoktur.
 *
 * Çıktı sırası:
 *   1. electron-builder asar-pack/copy → release/win-unpacked/Sefpos.exe
 *   2. Bu hook → rcedit.exe ile icon embed
 *   3. electron-builder NSIS adımı → installer Sefpos.exe'yi içine alır,
 *      yeni icon kullanılır.
 */
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;

  const projectRoot = path.resolve(__dirname, '..');
  const exePath = path.join(context.appOutDir, 'Sefpos.exe');
  const iconPath = path.join(projectRoot, 'public', 'SEFPOS.ico');
  const rceditPath = path.join(
    projectRoot,
    'node_modules',
    'electron-winstaller',
    'vendor',
    'rcedit.exe',
  );

  if (!fs.existsSync(exePath)) {
    console.warn(`[embed-icon] EXE bulunamadı: ${exePath}`);
    return;
  }
  if (!fs.existsSync(iconPath)) {
    console.warn(`[embed-icon] ICO bulunamadı: ${iconPath}`);
    return;
  }
  if (!fs.existsSync(rceditPath)) {
    console.warn(`[embed-icon] rcedit.exe bulunamadı: ${rceditPath}`);
    return;
  }

  await runRcedit(rceditPath, [
    exePath,
    '--set-icon', iconPath,
    '--set-version-string', 'CompanyName', 'ŞefPOS',
    '--set-version-string', 'ProductName', 'ŞefPOS',
    '--set-version-string', 'FileDescription', 'ŞefPOS',
    '--set-version-string', 'OriginalFilename', 'Sefpos.exe',
    '--set-version-string', 'InternalName', 'Sefpos',
    '--set-version-string', 'LegalCopyright', `Copyright © ${new Date().getFullYear()} ŞefPOS`,
  ]);

  console.log(`[embed-icon] ✓ Sefpos.exe iconu güncellendi → ${path.basename(iconPath)}`);
};

function runRcedit(rceditPath, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(rceditPath, args, { stdio: 'inherit' });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`rcedit exited with code ${code}`));
    });
  });
}
