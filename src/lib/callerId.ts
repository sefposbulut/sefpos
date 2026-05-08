/**
 * Renderer tarafı Caller ID köprüsü.
 *
 * Mantık:
 *   - Electron preload, `window.electronAPI.cidStart/Stop/Status` ve
 *     `onCallerIdRing/Signal/Error` köprüleri sağlar.
 *   - Web sürümünde (electronAPI yok) hiçbir şey yapmaz; geliştiriciye
 *     kolaylık olsun diye `simulateRing` ile manuel test edilebilir.
 *   - Tek `EventTarget` üzerinden birden fazla bileşen aynı çağrıyı dinleyebilir.
 */

export interface CallerIdRing {
  deviceSerial: string;
  line: string;
  /** Sayısal normalize edilmiş (boşluk, tire, parantez temizlenmiş). */
  phone: string;
  rawPhone: string;
  dateTime: string;
  other: string;
  ts: number;
}

export interface CallerIdSignal {
  connected: boolean;
  deviceModel: string;
  deviceSerial: string;
  signals: number[];
  ts: number;
}

export interface CallerIdStatus {
  available: boolean;
  running: boolean;
  dllPath?: string;
  connected?: boolean;
  deviceModel?: string;
  deviceSerial?: string;
  softTest?: boolean;
  lastError?: string | null;
}

type RingHandler = (payload: CallerIdRing) => void;
type SignalHandler = (payload: CallerIdSignal) => void;
type ErrorHandler = (payload: { message: string }) => void;

interface ElectronApiShape {
  cidStart?: (opts: { softTest?: boolean; arch?: string; dllPath?: string }) => Promise<{ ok: boolean; error?: string; status?: CallerIdStatus }>;
  cidStop?: () => Promise<{ ok: boolean; error?: string }>;
  cidStatus?: () => Promise<CallerIdStatus>;
  onCallerIdRing?: (cb: RingHandler) => () => void;
  onCallerIdSignal?: (cb: SignalHandler) => () => void;
  onCallerIdError?: (cb: ErrorHandler) => () => void;
  isElectron?: boolean;
}

declare global {
  interface Window {
    electronAPI?: ElectronApiShape;
  }
}

function getApi(): ElectronApiShape | null {
  if (typeof window === 'undefined') return null;
  return window.electronAPI ?? null;
}

const ringTarget = new EventTarget();
const signalTarget = new EventTarget();
const errorTarget = new EventTarget();

let bridgeAttached = false;
let detachers: Array<() => void> = [];

function attachBridgeOnce() {
  if (bridgeAttached) return;
  const api = getApi();
  if (!api) return;
  if (typeof api.onCallerIdRing === 'function') {
    detachers.push(
      api.onCallerIdRing((payload) => {
        ringTarget.dispatchEvent(new CustomEvent<CallerIdRing>('ring', { detail: payload }));
      }),
    );
  }
  if (typeof api.onCallerIdSignal === 'function') {
    detachers.push(
      api.onCallerIdSignal((payload) => {
        signalTarget.dispatchEvent(new CustomEvent<CallerIdSignal>('signal', { detail: payload }));
      }),
    );
  }
  if (typeof api.onCallerIdError === 'function') {
    detachers.push(
      api.onCallerIdError((payload) => {
        errorTarget.dispatchEvent(new CustomEvent<{ message: string }>('error', { detail: payload }));
      }),
    );
  }
  bridgeAttached = true;
}

export function isCallerIdAvailable(): boolean {
  const api = getApi();
  return !!api && typeof api.cidStart === 'function';
}

export async function startCallerId(opts: { softTest?: boolean } = {}): Promise<CallerIdStatus> {
  const api = getApi();
  if (!api?.cidStart) {
    return { available: false, running: false };
  }
  attachBridgeOnce();
  const res = await api.cidStart(opts);
  if (!res.ok) {
    throw new Error(res.error || 'Caller ID başlatılamadı');
  }
  return res.status ?? { available: true, running: true };
}

export async function stopCallerId(): Promise<void> {
  const api = getApi();
  if (!api?.cidStop) return;
  await api.cidStop();
}

export async function callerIdStatus(): Promise<CallerIdStatus> {
  const api = getApi();
  if (!api?.cidStatus) return { available: false, running: false };
  attachBridgeOnce();
  return await api.cidStatus();
}

export function onCallerIdRing(cb: RingHandler): () => void {
  attachBridgeOnce();
  const handler = (e: Event) => {
    const ce = e as CustomEvent<CallerIdRing>;
    cb(ce.detail);
  };
  ringTarget.addEventListener('ring', handler);
  return () => ringTarget.removeEventListener('ring', handler);
}

export function onCallerIdSignal(cb: SignalHandler): () => void {
  attachBridgeOnce();
  const handler = (e: Event) => {
    const ce = e as CustomEvent<CallerIdSignal>;
    cb(ce.detail);
  };
  signalTarget.addEventListener('signal', handler);
  return () => signalTarget.removeEventListener('signal', handler);
}

export function onCallerIdError(cb: ErrorHandler): () => void {
  attachBridgeOnce();
  const handler = (e: Event) => {
    const ce = e as CustomEvent<{ message: string }>;
    cb(ce.detail);
  };
  errorTarget.addEventListener('error', handler);
  return () => errorTarget.removeEventListener('error', handler);
}

/** Geliştirici/test için: gerçek cihaz olmadan ring olayı simüle eder. */
export function simulateRing(phone: string): void {
  attachBridgeOnce();
  const payload: CallerIdRing = {
    deviceSerial: 'SIMULATED',
    line: '1',
    phone: phone.replace(/[^0-9+]/g, ''),
    rawPhone: phone,
    dateTime: new Date().toISOString(),
    other: '',
    ts: Date.now(),
  };
  ringTarget.dispatchEvent(new CustomEvent<CallerIdRing>('ring', { detail: payload }));
}

export const callerIdLocalSettings = {
  STORAGE_KEY: 'sefpos_caller_id_settings_v1',
  load(): { autoStart: boolean; softTest: boolean } {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (!raw) return { autoStart: true, softTest: false };
      const j = JSON.parse(raw);
      return {
        autoStart: typeof j.autoStart === 'boolean' ? j.autoStart : true,
        softTest: typeof j.softTest === 'boolean' ? j.softTest : false,
      };
    } catch {
      return { autoStart: true, softTest: false };
    }
  },
  save(value: { autoStart: boolean; softTest: boolean }): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(value));
    } catch {
      /* yoksay */
    }
  },
};
