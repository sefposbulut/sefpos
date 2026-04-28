import { supabase } from './supabase';

// Get device binding code - ALWAYS unique per device, NOT stored
export function getDeviceBindingCode(): string {
  // One-time per device/browser code (persistent)
  const key = 'waiter_device_code';
  const existing = localStorage.getItem(key);
  if (existing && existing.length === 6) return existing.toUpperCase();

  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const fingerprint = getBrowserFingerprint(); // first 2 chars stay stable
  let randomPart = '';
  for (let i = 0; i < 4; i++) {
    randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  const code = `${fingerprint}${randomPart}`.slice(0, 6).toUpperCase();
  localStorage.setItem(key, code);
  return code;
}

// Get browser fingerprint (persistent per browser)
function getBrowserFingerprint(): string {
  let fingerprint = localStorage.getItem('browser_fingerprint');
  if (!fingerprint) {
    // Create fingerprint from browser info
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    fingerprint = '';
    for (let i = 0; i < 2; i++) {
      fingerprint += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    localStorage.setItem('browser_fingerprint', fingerprint);
  }
  return fingerprint;
}

interface DeviceInfo {
  fingerprint: string;
  ipAddress: string;
  deviceName: string;
}

interface ValidationResult {
  allowed: boolean;
  reason?: string;
  register_required?: boolean;
  device_name?: string;
}

// Get local IP address (works in Electron)
async function getLocalIpAddress(): Promise<string> {
  if ((window as any).electronAPI?.getIpAddress) {
    try {
      return await (window as any).electronAPI.getIpAddress();
    } catch (e) {
      console.error('Error getting IP from Electron:', e);
    }
  }

  // Fallback for web (won't work due to CORS)
  try {
    const response = await fetch('https://api.ipify.org?format=json');
    const data = await response.json();
    return data.ip;
  } catch (e) {
    console.error('Error getting public IP:', e);
    return 'unknown';
  }
}

// Generate device fingerprint (hardware + MAC)
async function generateDeviceFingerprint(): Promise<string> {
  if ((window as any).electronAPI?.getDeviceFingerprint) {
    try {
      return await (window as any).electronAPI.getDeviceFingerprint();
    } catch (e) {
      console.error('Error getting device fingerprint from Electron:', e);
    }
  }

  // Fallback for web (less secure)
  const nav = navigator as any;
  const data = `${nav.hardwareConcurrency}-${nav.deviceMemory}-${nav.platform}-${screen.width}x${screen.height}`;
  const encoder = new TextEncoder();
  const bytes = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Get stored encryption key
function getStoredEncryptionKey(): string | null {
  try {
    return localStorage.getItem('device_encryption_key');
  } catch (e) {
    console.error('Error reading encryption key:', e);
    return null;
  }
}

// Store encryption key securely
function storeEncryptionKey(key: string): void {
  try {
    localStorage.setItem('device_encryption_key', key);
  } catch (e) {
    console.error('Error storing encryption key:', e);
  }
}

// Register new device
export async function registerDevice(deviceName: string): Promise<{ success: boolean; encryptionKey?: string; error?: string }> {
  try {
    const fingerprint = await generateDeviceFingerprint();
    const ipAddress = await getLocalIpAddress();

    const { data, error } = await supabase.rpc('register_new_device', {
      p_device_name: deviceName,
      p_device_fingerprint: fingerprint,
      p_ip_address: ipAddress,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    if (data?.success && data?.encryption_key) {
      storeEncryptionKey(data.encryption_key);
      return {
        success: true,
        encryptionKey: data.encryption_key,
      };
    }

    return { success: false, error: data?.error || 'Device registration failed' };
  } catch (e) {
    console.error('Device registration error:', e);
    return { success: false, error: String(e) };
  }
}

// Validate device access
export async function validateDeviceAccess(): Promise<ValidationResult> {
  try {
    const fingerprint = await generateDeviceFingerprint();
    const ipAddress = await getLocalIpAddress();
    const encryptionKey = getStoredEncryptionKey();

    if (!encryptionKey) {
      return {
        allowed: false,
        reason: 'Device not registered. Please register this device first.',
        register_required: true,
      };
    }

    const { data, error } = await supabase.rpc('validate_device_access', {
      p_device_fingerprint: fingerprint,
      p_ip_address: ipAddress,
      p_encryption_key: encryptionKey,
    });

    if (error) {
      console.error('Device validation error:', error);
      return {
        allowed: false,
        reason: 'Failed to validate device. Please try again.',
      };
    }

    return data || { allowed: false, reason: 'Unknown error' };
  } catch (e) {
    console.error('Device access validation error:', e);
    return {
      allowed: false,
      reason: 'Failed to validate device access. Please try again.',
    };
  }
}

// Get encryption key for recovery
export async function getRecoveryKey(): Promise<{ success: boolean; key?: string; error?: string }> {
  try {
    const fingerprint = await generateDeviceFingerprint();

    const { data, error } = await supabase.rpc('get_device_encryption_key', {
      p_device_fingerprint: fingerprint,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    if (data?.success) {
      return {
        success: true,
        key: data.encryption_key,
      };
    }

    return { success: false, error: data?.error || 'Failed to get encryption key' };
  } catch (e) {
    console.error('Recovery key error:', e);
    return { success: false, error: String(e) };
  }
}

// Clear stored key (logout)
export function clearDeviceKey(): void {
  try {
    localStorage.removeItem('device_encryption_key');
  } catch (e) {
    console.error('Error clearing device key:', e);
  }
}

// Check if device needs registration
export async function isDeviceRegistered(): Promise<boolean> {
  const key = getStoredEncryptionKey();
  if (!key) return false;

  const result = await validateDeviceAccess();
  return result.allowed;
}
