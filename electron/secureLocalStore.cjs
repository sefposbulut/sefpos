/**
 * Windows DPAPI (Electron safeStorage) ile yerel hassas dosyalar.
 * Müşteri PC'sinde yalnızca o Windows kullanıcısı okuyabilir.
 */
const fs = require('fs');
const { safeStorage } = require('electron');

function encryptionAvailable() {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

function writeSecureJson(filePath, payload) {
  const plain = JSON.stringify(payload);
  fs.mkdirSync(require('path').dirname(filePath), { recursive: true });
  if (encryptionAvailable()) {
    const encrypted = safeStorage.encryptString(plain);
    fs.writeFileSync(filePath, encrypted);
    return true;
  }
  fs.writeFileSync(filePath, plain, 'utf8');
  return false;
}

function readSecureJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath);
  if (encryptionAvailable()) {
    try {
      const plain = safeStorage.decryptString(raw);
      return JSON.parse(plain);
    } catch {
      /* düz metin eski dosya */
    }
  }
  try {
    return JSON.parse(raw.toString('utf8'));
  } catch {
    return null;
  }
}

module.exports = { writeSecureJson, readSecureJson, encryptionAvailable };
