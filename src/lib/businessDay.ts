/**
 * Business day = 06:00 cutoff.
 * 06:00–24:00 -> bugun
 * 00:00–06:00 -> dun
 * Ortak yardimcilar (hem ShiftManager hem EndOfDay hem AuthContext kullanir).
 */

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function computeBusinessDate(d: Date = new Date()): string {
  const x = new Date(d);
  if (x.getHours() < 6) {
    x.setDate(x.getDate() - 1);
  }
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
}

export function getBusinessDayRange(d: Date = new Date()): { start: Date; end: Date } {
  const now = new Date(d);
  const hour = now.getHours();
  const start = new Date(now);
  const end = new Date(now);
  if (hour < 6) {
    start.setDate(start.getDate() - 1);
  }
  start.setHours(6, 0, 0, 0);
  if (hour >= 6) {
    end.setDate(end.getDate() + 1);
  }
  end.setHours(4, 0, 0, 0);
  return { start, end };
}

export function suggestShiftNo(d: Date = new Date()): 1 | 2 | 3 {
  const h = d.getHours();
  if (h >= 6 && h < 14) return 1;
  if (h >= 14 && h < 22) return 2;
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
