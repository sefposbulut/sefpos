/** Ortak rapor dönemi ve yardımcılar (Raporlar v2). */

export type ReportPeriod = 'today' | 'yesterday' | 'week' | 'month' | 'custom';

export interface DateRange {
  start: string;
  end: string;
  /** YYYY-MM-DD — vardiya business_date filtreleri için */
  startDate: string;
  endDate: string;
}

export const REPORT_PERIOD_LABELS: Record<ReportPeriod, string> = {
  today: 'Bugün',
  yesterday: 'Dün',
  week: 'Son 7 Gün',
  month: 'Bu Ay',
  custom: 'Özel Aralık',
};

export const DEFAULT_REPORT_PERIODS: ReportPeriod[] = [
  'today',
  'yesterday',
  'week',
  'month',
  'custom',
];

export function fmtMoney(n: number): string {
  return new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export function fmtInt(n: number): string {
  return new Intl.NumberFormat('tr-TR').format(Math.round(n));
}

export function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null;
  return ((current - previous) / previous) * 100;
}

export function formatPctDelta(pct: number | null): string {
  if (pct === null) return '—';
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}%`;
}

function dateOnly(d: Date): string {
  return d.toISOString().split('T')[0];
}

export function getReportDateRange(
  period: ReportPeriod,
  customStart?: string,
  customEnd?: string,
): DateRange {
  const now = new Date();
  const today = dateOnly(now);

  if (period === 'today') {
    return {
      start: `${today}T00:00:00`,
      end: `${today}T23:59:59`,
      startDate: today,
      endDate: today,
    };
  }
  if (period === 'yesterday') {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    const ys = dateOnly(y);
    return {
      start: `${ys}T00:00:00`,
      end: `${ys}T23:59:59`,
      startDate: ys,
      endDate: ys,
    };
  }
  if (period === 'week') {
    const w = new Date(now);
    w.setDate(w.getDate() - 6);
    const ws = dateOnly(w);
    return {
      start: `${ws}T00:00:00`,
      end: `${today}T23:59:59`,
      startDate: ws,
      endDate: today,
    };
  }
  if (period === 'month') {
    const m = new Date(now.getFullYear(), now.getMonth(), 1);
    const ms = dateOnly(m);
    return {
      start: `${ms}T00:00:00`,
      end: `${today}T23:59:59`,
      startDate: ms,
      endDate: today,
    };
  }
  if (period === 'custom' && customStart && customEnd) {
    return {
      start: `${customStart}T00:00:00`,
      end: `${customEnd}T23:59:59`,
      startDate: customStart,
      endDate: customEnd,
    };
  }
  return {
    start: `${today}T00:00:00`,
    end: `${today}T23:59:59`,
    startDate: today,
    endDate: today,
  };
}

/** Aynı uzunlukta önceki dönem (karşılaştırma). */
export function getPreviousReportDateRange(range: DateRange): DateRange {
  const startMs = new Date(range.startDate + 'T12:00:00').getTime();
  const endMs = new Date(range.endDate + 'T12:00:00').getTime();
  const daySpan = Math.max(1, Math.round((endMs - startMs) / 86400000) + 1);

  const prevEnd = new Date(startMs);
  prevEnd.setDate(prevEnd.getDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevStart.getDate() - (daySpan - 1));

  const ps = dateOnly(prevStart);
  const pe = dateOnly(prevEnd);
  return {
    start: `${ps}T00:00:00`,
    end: `${pe}T23:59:59`,
    startDate: ps,
    endDate: pe,
  };
}

export interface ReportInsightInput {
  totalRevenue: number;
  prevRevenue: number;
  completedOrders: number;
  prevOrders: number;
  cancelRate: number;
  prevCancelRate: number;
  takeawayShare: number;
  onlineShare: number;
  topProduct?: string;
  peakHour?: number;
}

export function buildReportInsights(input: ReportInsightInput): string[] {
  const lines: string[] = [];
  const revPct = pctChange(input.totalRevenue, input.prevRevenue);
  if (revPct !== null) {
    if (revPct > 5) lines.push(`Ciro önceki döneme göre %${revPct.toFixed(0)} arttı.`);
    else if (revPct < -5) lines.push(`Ciro önceki döneme göre %${Math.abs(revPct).toFixed(0)} azaldı; kampanya veya menü kontrolü önerilir.`);
    else lines.push('Ciro önceki dönemle benzer seviyede.');
  }
  const ordPct = pctChange(input.completedOrders, input.prevOrders);
  if (ordPct !== null && Math.abs(ordPct) > 8) {
    lines.push(
      ordPct > 0
        ? `Sipariş adedi %${ordPct.toFixed(0)} yükseldi.`
        : `Sipariş adedi %${Math.abs(ordPct).toFixed(0)} düştü.`,
    );
  }
  if (input.cancelRate > 8 && input.cancelRate > input.prevCancelRate + 2) {
    lines.push(`İptal oranı %${input.cancelRate.toFixed(1)} — personel ve stok kontrolü önerilir.`);
  }
  if (input.onlineShare > 35) {
    lines.push(`Online kanal cirosunun %${input.onlineShare.toFixed(0)}'ini oluşturuyor.`);
  } else if (input.takeawayShare > 40) {
    lines.push(`Paket servis payı %${input.takeawayShare.toFixed(0)} — kurye kapasitesini gözden geçirin.`);
  }
  if (input.peakHour !== undefined) {
    lines.push(`En yoğun saat: ${String(input.peakHour).padStart(2, '0')}:00 civarı.`);
  }
  if (input.topProduct) {
    lines.push(`En çok satan ürün: ${input.topProduct}.`);
  }
  if (lines.length === 0) {
    lines.push('Seçilen dönem için özet metrikler aşağıda; detay için sekmelere geçin.');
  }
  return lines.slice(0, 5);
}

export function printReportSection(title: string, elementId: string): void {
  const el = document.getElementById(elementId);
  if (!el) {
    window.print();
    return;
  }
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title} — ŞefPOS</title>
<style>body{font-family:system-ui,sans-serif;padding:24px;color:#0f172a}h1{font-size:20px}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #e2e8f0;padding:8px;text-align:left;font-size:13px}th{background:#f8fafc}</style></head><body>
<h1>${title}</h1>
<p style="color:#64748b;font-size:13px">${new Date().toLocaleString('tr-TR')}</p>
${el.innerHTML}
</body></html>`);
  w.document.close();
  w.focus();
  w.print();
}
