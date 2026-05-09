/**
 * Business day = ayarlanabilir cutoff saati (default 06:00).
 * Her sube/tenant kendi cutoff'unu yapilandirabilir.
 *
 * Cutoff'tan once -> dunku is gunu
 * Cutoff'tan sonra -> bugunku is gunu
 *
 * Ortak yardimcilar (hem ShiftManager hem EndOfDay hem AuthContext kullanir).
 */

const DEFAULT_CUTOFF_HOUR = 6;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function clampCutoff(h: number | null | undefined): number {
  if (typeof h !== 'number' || !Number.isFinite(h)) return DEFAULT_CUTOFF_HOUR;
  const v = Math.floor(h);
  if (v < 0) return 0;
  if (v > 23) return 23;
  return v;
}

export function computeBusinessDate(d: Date = new Date(), cutoffHour: number = DEFAULT_CUTOFF_HOUR): string {
  const cutoff = clampCutoff(cutoffHour);
  const x = new Date(d);
  if (x.getHours() < cutoff) {
    x.setDate(x.getDate() - 1);
  }
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
}

export function getBusinessDayRange(d: Date = new Date(), cutoffHour: number = DEFAULT_CUTOFF_HOUR): { start: Date; end: Date } {
  const cutoff = clampCutoff(cutoffHour);
  const now = new Date(d);
  const hour = now.getHours();
  const start = new Date(now);
  const end = new Date(now);
  if (hour < cutoff) {
    start.setDate(start.getDate() - 1);
  }
  start.setHours(cutoff, 0, 0, 0);
  if (hour >= cutoff) {
    end.setDate(end.getDate() + 1);
  }
  // End = cutoff'tan iki saat once (eski kod 04:00 idi, 06:00 cutoff icin = cutoff-2)
  // Cutoff degisirse bu 2 saatlik tampon korunur ama negatif olamaz.
  let endHour = cutoff - 2;
  if (endHour < 0) endHour += 24;
  end.setHours(endHour, 0, 0, 0);
  return { start, end };
}

/**
 * Cutoff'a gore vardiya numarasi onerir.
 * cutoff..(cutoff+8): 1 (Sabah/ilk vardiya)
 * (cutoff+8)..(cutoff+16): 2 (Ogle/ikinci)
 * geri kalan: 3 (Aksam/ucuncu)
 */
export function suggestShiftNo(d: Date = new Date(), cutoffHour: number = DEFAULT_CUTOFF_HOUR): 1 | 2 | 3 {
  const cutoff = clampCutoff(cutoffHour);
  const h = d.getHours();
  // Cutoff'a gore "kacinci saat"
  let rel = h - cutoff;
  if (rel < 0) rel += 24;
  if (rel < 8) return 1;
  if (rel < 16) return 2;
  return 3;
}

export function formatBusinessDateTR(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date + 'T12:00:00') : date;
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function shiftDurationLabel(openedAt: string, closedAt?: string | null): string {
  const start = new Date(openedAt).getTime();
  const end = closedAt ? new Date(closedAt).getTime() : Date.now();
  const ms = Math.max(0, end - start);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h > 0) return `${h}sa ${m}dk`;
  return `${m}dk`;
}

import { Sun, Sunset, Moon, Layers, Coffee, Briefcase, Stars } from 'lucide-react';

/**
 * Vardiya numarasina gore ikon (genisletilmis 1..9).
 * 1 Sabah, 2 Ogle, 3 Aksam, 4 Gece, 5+ esnek/ek vardiyalar (genel ikonlar).
 */
export function shiftIcon(no: number): typeof Sun {
  switch (no) {
    case 1: return Sun;
    case 2: return Sunset;
    case 3: return Moon;
    case 4: return Stars;
    case 5: return Coffee;
    case 6: return Briefcase;
    default: return Layers;
  }
}
