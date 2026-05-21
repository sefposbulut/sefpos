import { primeAudio } from './beep';

let audioUnlocked = false;
let mp3: HTMLAudioElement | null = null;

/** Kurye girişinde veya ilk dokunuşta çağırın (iOS/Android ses izni). */
export function primeCourierAudio(): void {
  primeAudio();
  audioUnlocked = true;
  try {
    if (!mp3) {
      mp3 = new Audio('./notification.mp3');
      mp3.volume = 0.9;
    }
    mp3.currentTime = 0;
    void mp3.play().then(() => {
      mp3?.pause();
      if (mp3) mp3.currentTime = 0;
    }).catch(() => {});
  } catch {
    /* noop */
  }
}

function beepSequence(): void {
  const ctx =
    (window as any).AudioContext && new ((window as any).AudioContext || (window as any).webkitAudioContext)();
  if (!ctx) return;
  const playTone = (freq: number, t: number, dur: number) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.frequency.value = freq;
    osc.type = 'square';
    g.gain.value = 0.2;
    osc.connect(g).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur);
  };
  void ctx.resume().catch(() => {});
  playTone(880, ctx.currentTime, 0.12);
  playTone(1100, ctx.currentTime + 0.15, 0.12);
  playTone(1320, ctx.currentTime + 0.3, 0.18);
}

/** Yeni paket ataması — ses + titreşim + sistem bildirimi. */
export function playCourierAssignmentAlert(title: string, body: string): void {
  try {
    (navigator as any)?.vibrate?.([120, 80, 120, 80, 200]);
  } catch {
    /* noop */
  }

  beepSequence();

  if (audioUnlocked && mp3) {
    try {
      mp3.currentTime = 0;
      void mp3.play().catch(() => beepSequence());
    } catch {
      beepSequence();
    }
  } else {
    try {
      const a = new Audio('./notification.mp3');
      a.volume = 0.9;
      void a.play().catch(() => {});
    } catch {
      /* noop */
    }
  }

  showCourierNotification(title, body);
}

export async function requestCourierNotificationPermission(): Promise<boolean> {
  if (typeof Notification === 'undefined') return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  try {
    const r = await Notification.requestPermission();
    return r === 'granted';
  } catch {
    return false;
  }
}

export function showCourierNotification(title: string, body: string, tag = 'courier-assign'): void {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  try {
    const n = new Notification(title, {
      body,
      tag,
      icon: './logo256.png',
      badge: './logo256.png',
      requireInteraction: true,
    });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch {
    /* noop */
  }
}

export function isIosStandaloneHint(): boolean {
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua);
  const standalone = (window.navigator as any).standalone === true;
  return ios && !standalone;
}
