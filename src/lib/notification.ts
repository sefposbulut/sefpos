// src/lib/notification.ts
//
// Online sipariş için sürekli alarm sistemi. Yemeksepeti / Getir tarzi:
// yeni siparişten sonra zil sürekli çalar, kullanici siparişi onaylayana
// veya manuel olarak susturana kadar durmaz.
//
// Browser autoplay policy: AudioContext yalnizca kullanici etkilesimi
// sonrasi olusturulur / resume edilir. Mount'ta unlock denenmez.

export class NotificationSound {
  private audio: HTMLAudioElement | null = null;
  private isEnabled: boolean = true;

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        this.audio = new Audio('./notification.mp3');
        this.audio.volume = 0.7;
      } catch {
        this.audio = null;
      }
      const savedPreference = localStorage.getItem('notification_sound_enabled');
      if (savedPreference !== null) {
        this.isEnabled = savedPreference === 'true';
      }
    }
  }

  async play() {
    if (!this.isEnabled || !this.audio) return;
    try {
      this.audio.currentTime = 0;
      await this.audio.play();
    } catch (error) {
      console.error('Notification sound error:', error);
    }
  }

  setEnabled(enabled: boolean) {
    this.isEnabled = enabled;
    localStorage.setItem('notification_sound_enabled', enabled.toString());
  }

  isNotificationEnabled(): boolean {
    return this.isEnabled;
  }
}

export const notificationSound = new NotificationSound();

// ============================================================================
// GLOBAL AUDIO CONTEXT — yalnizca kullanici jestinden sonra
// ============================================================================

let globalAudioCtx: AudioContext | null = null;
let audioUnlocked = false;
let unlockInFlight: Promise<boolean> | null = null;

export function isAudioUnlocked(): boolean {
  return audioUnlocked && globalAudioCtx?.state === 'running';
}

/** Calisabilir AudioContext (unlock sonrasi). */
export function getSharedAudioContext(): AudioContext | null {
  if (!isAudioUnlocked()) return null;
  return globalAudioCtx;
}

function getCtx(): AudioContext | null {
  return getSharedAudioContext();
}

/**
 * Tarayicinin autoplay politikasini asmak icin AudioContext'i unlock eder.
 * Yalnizca kullanici tiklamasi / tusuna basmasi sonrasi cagrilmali.
 */
export async function unlockAudio(): Promise<boolean> {
  if (isAudioUnlocked()) return true;
  if (unlockInFlight) return unlockInFlight;
  if (typeof window === 'undefined') return false;

  unlockInFlight = (async () => {
    const AC = (window as Window & { webkitAudioContext?: typeof AudioContext }).AudioContext
      || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return false;
    try {
      if (!globalAudioCtx) {
        globalAudioCtx = new AC();
      }
      if (globalAudioCtx.state === 'suspended') {
        await globalAudioCtx.resume();
      }
      if (globalAudioCtx.state !== 'running') return false;

      const osc = globalAudioCtx.createOscillator();
      const gain = globalAudioCtx.createGain();
      gain.gain.value = 0.0001;
      osc.connect(gain).connect(globalAudioCtx.destination);
      osc.start();
      osc.stop(globalAudioCtx.currentTime + 0.01);
      audioUnlocked = true;
      return true;
    } catch {
      return false;
    } finally {
      unlockInFlight = null;
    }
  })();

  return unlockInFlight;
}

/**
 * Ilk kullanici etkilesiminde audio unlock (App.tsx bir kere cagirir).
 */
export function installAudioUnlockOnInteraction(): void {
  if (typeof window === 'undefined') return;
  const handler = () => {
    void unlockAudio();
    window.removeEventListener('click', handler, true);
    window.removeEventListener('keydown', handler, true);
    window.removeEventListener('touchstart', handler, true);
  };
  window.addEventListener('click', handler, true);
  window.addEventListener('keydown', handler, true);
  window.addEventListener('touchstart', handler, true);
}

// ============================================================================
// GUCLU ALARM TONU — siren benzeri, alternating frekans
// ============================================================================

function playSiren(): Promise<void> {
  return new Promise((resolve) => {
    const ctx = getCtx();
    if (!ctx) return resolve();
    try {
      const now = ctx.currentTime;
      const tones = [
        { freq: 659.25, start: 0.0, dur: 0.35 },
        { freq: 1108.73, start: 0.32, dur: 0.4 },
        { freq: 880.0, start: 0.7, dur: 0.4 },
        { freq: 659.25, start: 1.05, dur: 0.4 },
        { freq: 1108.73, start: 1.4, dur: 0.55 },
      ];
      const masterGain = ctx.createGain();
      masterGain.gain.value = 0.45;
      masterGain.connect(ctx.destination);

      for (const t of tones) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = t.freq;
        gain.gain.setValueAtTime(0, now + t.start);
        gain.gain.linearRampToValueAtTime(0.9, now + t.start + 0.04);
        gain.gain.linearRampToValueAtTime(0.7, now + t.start + 0.15);
        gain.gain.exponentialRampToValueAtTime(0.001, now + t.start + t.dur);
        osc.connect(gain).connect(masterGain);
        osc.start(now + t.start);
        osc.stop(now + t.start + t.dur + 0.02);

        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'sine';
        osc2.frequency.value = t.freq * 2;
        gain2.gain.setValueAtTime(0, now + t.start);
        gain2.gain.linearRampToValueAtTime(0.15, now + t.start + 0.04);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + t.start + t.dur);
        osc2.connect(gain2).connect(masterGain);
        osc2.start(now + t.start);
        osc2.stop(now + t.start + t.dur + 0.02);
      }
      setTimeout(() => resolve(), 2000);
    } catch {
      resolve();
    }
  });
}

function playRingTone(): Promise<void> {
  return new Promise((resolve) => {
    const ctx = getCtx();
    if (!ctx) return resolve();
    try {
      const now = ctx.currentTime;
      const tones = [
        { freq: 784.0, start: 0.0, dur: 0.18 },
        { freq: 1046.5, start: 0.18, dur: 0.18 },
        { freq: 1318.5, start: 0.36, dur: 0.32 },
      ];
      for (const t of tones) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = t.freq;
        gain.gain.setValueAtTime(0, now + t.start);
        gain.gain.linearRampToValueAtTime(0.5, now + t.start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + t.start + t.dur);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now + t.start);
        osc.stop(now + t.start + t.dur + 0.05);
      }
      setTimeout(() => resolve(), 700);
    } catch {
      resolve();
    }
  });
}

function pickTurkishVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  if (!voices.length) return null;
  const ranked = [
    /microsoft aslı (online|natural)/i,
    /aslı.*natural/i,
    /microsoft aslı/i,
    /aslı/i,
    /microsoft tolga (online|natural)/i,
    /tolga.*natural/i,
    /microsoft tolga/i,
    /tolga/i,
    /google.*türk/i,
    /google.*turkish/i,
  ];
  for (const pat of ranked) {
    const v = voices.find((voice) => pat.test(voice.name));
    if (v) return v;
  }
  const anyTr = voices.find((v) => v.lang && v.lang.toLowerCase().startsWith('tr'));
  return anyTr || null;
}

let cachedTrVoice: SpeechSynthesisVoice | null = null;
function getTurkishVoice(): SpeechSynthesisVoice | null {
  if (cachedTrVoice) return cachedTrVoice;
  if (!('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  cachedTrVoice = pickTurkishVoice(voices);
  return cachedTrVoice;
}

function speakTr(text: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      if (!('speechSynthesis' in window)) return resolve();
      const synth = window.speechSynthesis;
      synth.cancel();
      const speak = () => {
        const utter = new SpeechSynthesisUtterance(text);
        utter.lang = 'tr-TR';
        utter.rate = 0.88;
        utter.pitch = 0.95;
        utter.volume = 1.0;
        const v = getTurkishVoice();
        if (v) utter.voice = v;
        utter.onend = () => resolve();
        utter.onerror = () => resolve();
        synth.speak(utter);
        setTimeout(() => resolve(), 8000);
      };
      const voices = synth.getVoices();
      if (voices.length === 0) {
        synth.onvoiceschanged = () => {
          cachedTrVoice = null;
          speak();
        };
        setTimeout(speak, 250);
      } else {
        speak();
      }
    } catch {
      resolve();
    }
  });
}

function buildAnnouncement(platformLabel: string): string {
  const platform = (platformLabel || 'Online').trim();
  const norm = platform
    .replace(/^getir.*yemek$/i, 'Getir Yemek')
    .replace(/^getir$/i, 'Getir Yemek')
    .replace(/^yemek.?sepeti$/i, 'Yemeksepeti')
    .replace(/^trendyol.*go.*yemek$/i, 'Trendyol Go Yemek')
    .replace(/^trendyol.*yemek$/i, 'Trendyol Yemek')
    .replace(/^trendyol$/i, 'Trendyol Yemek')
    .replace(/^migros.*yemek$/i, 'Migros Yemek')
    .replace(/^migros$/i, 'Migros Yemek');
  return `Dikkat. ${norm} üzerinden yeni sipariş alındı. Lütfen onayınız bekleniyor.`;
}

export async function playOnlineOrderAlert(
  platformLabel: string = 'Online',
  count: number = 1,
): Promise<void> {
  const enabled = localStorage.getItem('notification_sound_enabled');
  if (enabled === 'false') return;
  if (!isAudioUnlocked()) {
    void notificationSound.play();
    return;
  }
  await playSiren();
  const phrase =
    count > 1
      ? `Dikkat. ${count} yeni online sipariş alındı. Lütfen onayınız bekleniyor.`
      : buildAnnouncement(platformLabel);
  await speakTr(phrase);
}

export function playNotificationSound() {
  if (!isAudioUnlocked()) {
    void notificationSound.play();
    return;
  }
  void playSiren();
}

// ============================================================================
// SUREKLI ALARM
// ============================================================================

interface ActiveAlarm {
  orderId: string;
  platformLabel: string;
  running: boolean;
  pauseTimerId?: ReturnType<typeof setTimeout>;
}

const activeAlarms = new Map<string, ActiveAlarm>();

export function startContinuousAlert(
  orderId: string,
  platformLabel: string = 'Online',
  pauseBetweenMs: number = 1500,
): void {
  const enabled = localStorage.getItem('notification_sound_enabled');
  if (enabled === 'false') return;
  if (activeAlarms.has(orderId)) return;

  if (!isAudioUnlocked()) {
    void notificationSound.play();
    return;
  }

  const announcement = buildAnnouncement(platformLabel);
  const entry: ActiveAlarm = { orderId, platformLabel, running: true };
  activeAlarms.set(orderId, entry);

  const loop = async () => {
    while (entry.running && activeAlarms.has(orderId)) {
      await playSiren();
      if (!entry.running || !activeAlarms.has(orderId)) break;
      await speakTr(announcement);
      if (!entry.running || !activeAlarms.has(orderId)) break;
      await new Promise<void>((r) => {
        const id = window.setTimeout(() => r(), pauseBetweenMs);
        entry.pauseTimerId = id;
      });
    }
  };

  void loop();
}

export function stopContinuousAlert(orderId: string): void {
  const a = activeAlarms.get(orderId);
  if (!a) return;
  a.running = false;
  if (a.pauseTimerId != null) window.clearTimeout(a.pauseTimerId);
  activeAlarms.delete(orderId);
  try {
    window.speechSynthesis?.cancel();
  } catch {
    /* ignore */
  }
}

export function stopAllAlerts(): void {
  for (const a of activeAlarms.values()) {
    a.running = false;
    if (a.pauseTimerId != null) window.clearTimeout(a.pauseTimerId);
  }
  activeAlarms.clear();
  try {
    window.speechSynthesis?.cancel();
  } catch {
    /* ignore */
  }
}

export function getActiveAlertOrderIds(): string[] {
  return Array.from(activeAlarms.keys());
}

export function getAudioState(): {
  hasContext: boolean;
  state: AudioContextState | 'no-context';
  unlocked: boolean;
} {
  return {
    hasContext: !!globalAudioCtx,
    state: globalAudioCtx?.state ?? 'no-context',
    unlocked: isAudioUnlocked(),
  };
}
