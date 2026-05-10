import { loadPrintSettings, printHtml, printToAdisyonPrinter, getAdisyonPrinterName } from './printService';

export type ShiftPrintFormat = '80mm' | 'a4';

export interface ShiftReportInput {
  shift_name: string;
  business_date: string;
  opened_at: string;
  closed_at: string | null;
  opening_cash: number;
  closing_cash: number | null;
  cash_revenue: number;
  card_revenue: number;
  open_account_revenue: number;
  total_revenue: number;
  expense_total: number;
  cash_in_total: number;
  cash_out_total: number;
  expected_cash: number;
  cash_difference: number;
  order_count: number;
  closing_notes?: string | null;
  shift_no?: number;
}

interface BuildOpts {
  title?: string;          // 'KİŞİSEL Z RAPORU' / 'VARDİYA Z RAPORU' / 'GÜN SONU RAPORU'
  restaurantName: string;
  branchName?: string;
  userName?: string;
  footer?: string;
}

function fmt(n: number | null | undefined): string {
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n || 0));
}

function shiftDuration(openedAt: string, closedAt?: string | null): string {
  const s = new Date(openedAt).getTime();
  const e = closedAt ? new Date(closedAt).getTime() : Date.now();
  const ms = Math.max(0, e - s);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h}sa ${m}dk` : `${m}dk`;
}

function formatBusinessDateTR(d: string): string {
  const dt = new Date(d + 'T12:00:00');
  return dt.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** 80mm POS fis sablonu — printService'in mevcut .center/.row/.line/.bold class'larini kullanir. */
export function buildShift80mmHtml(s: ShiftReportInput, o: BuildOpts): string {
  const title = o.title || 'KİŞİSEL Z RAPORU';
  return `
    <div class="center bold xlarge">${o.restaurantName || 'ŞefPOS'}</div>
    <div class="line"></div>
    <div class="center bold large">${title}</div>
    <div class="center">${s.shift_name}</div>
    ${o.userName ? `<div class="center">${o.userName}</div>` : ''}
    ${o.branchName ? `<div class="center">${o.branchName}</div>` : ''}
    <div class="center">${formatBusinessDateTR(s.business_date)}</div>
    <div class="line"></div>
    <div class="row"><span>Açılış</span><span>${new Date(s.opened_at).toLocaleString('tr-TR')}</span></div>
    <div class="row"><span>Kapanış</span><span>${s.closed_at ? new Date(s.closed_at).toLocaleString('tr-TR') : '-'}</span></div>
    <div class="row"><span>Süre</span><span>${shiftDuration(s.opened_at, s.closed_at)}</span></div>
    <div class="line"></div>
    <div class="row bold"><span>SATIŞLAR</span><span></span></div>
    <div class="line"></div>
    <div class="row"><span>Nakit</span><span>${fmt(s.cash_revenue)} ₺</span></div>
    <div class="row"><span>Kredi Kartı</span><span>${fmt(s.card_revenue)} ₺</span></div>
    <div class="row"><span>Cari Hesap</span><span>${fmt(s.open_account_revenue)} ₺</span></div>
    <div class="row bold"><span>TOPLAM</span><span>${fmt(s.total_revenue)} ₺</span></div>
    <div class="line"></div>
    <div class="row bold"><span>KASA</span><span></span></div>
    <div class="line"></div>
    <div class="row"><span>Açılış Nakit</span><span>${fmt(s.opening_cash)} ₺</span></div>
    <div class="row"><span>Nakit Giriş</span><span>+${fmt(s.cash_in_total)} ₺</span></div>
    <div class="row"><span>Nakit Çıkış</span><span>-${fmt(s.cash_out_total)} ₺</span></div>
    <div class="row"><span>Giderler</span><span>-${fmt(s.expense_total)} ₺</span></div>
    <div class="row"><span>Beklenen</span><span>${fmt(s.expected_cash)} ₺</span></div>
    <div class="row"><span>Sayılan</span><span>${fmt(s.closing_cash || 0)} ₺</span></div>
    <div class="row bold"><span>FARK</span><span>${s.cash_difference >= 0 ? '+' : ''}${fmt(s.cash_difference)} ₺</span></div>
    <div class="line"></div>
    <div class="row"><span>Sipariş</span><span>${s.order_count}</span></div>
    ${s.closing_notes ? `<div class="line"></div><div class="center small">${s.closing_notes}</div>` : ''}
    <div class="line"></div>
    <div class="footer">${o.footer || 'Sistem tarafından oluşturuldu'}</div>
    <br><br><br>
  `;
}

/** A4 sayfa sablonu — yeni window.open + tam HTML belge + window.print(). */
export function buildShiftA4Html(s: ShiftReportInput, o: BuildOpts): string {
  const title = o.title || 'KİŞİSEL Z RAPORU';
  const diffClass = s.cash_difference === 0 ? 'ok' : s.cash_difference > 0 ? 'plus' : 'minus';
  return `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="utf-8" />
<title>${title} — ${s.shift_name}</title>
<style>
  @page { size: A4 portrait; margin: 18mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Inter', 'Segoe UI', Arial, sans-serif; color: #0f172a; margin: 0; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  h2 { font-size: 14px; margin: 24px 0 8px; color: #475569; text-transform: uppercase; letter-spacing: .12em; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 8px; padding-bottom: 12px; border-bottom: 3px solid #f97316; }
  .meta { font-size: 11px; color: #64748b; line-height: 1.5; }
  .badge { display: inline-block; background: linear-gradient(135deg, #f97316, #e11d48); color: #fff; font-weight: 800; font-size: 11px; padding: 4px 10px; border-radius: 999px; letter-spacing: .08em; text-transform: uppercase; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .card { border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px 14px; background: #f8fafc; }
  .card .label { font-size: 10px; color: #64748b; font-weight: 700; text-transform: uppercase; letter-spacing: .12em; }
  .card .value { font-size: 18px; font-weight: 800; color: #0f172a; margin-top: 2px; }
  .card.highlight { background: linear-gradient(135deg, #ecfeff, #f0fdf4); border-color: #6ee7b7; }
  .card.highlight .value { color: #047857; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { padding: 8px 10px; border-bottom: 1px solid #e2e8f0; text-align: left; }
  th { background: #f1f5f9; font-weight: 700; color: #475569; text-transform: uppercase; font-size: 10px; letter-spacing: .08em; }
  td.right, th.right { text-align: right; }
  tr.total td { font-weight: 800; font-size: 14px; background: #0f172a; color: #fff; }
  .pill { display: inline-block; padding: 3px 10px; border-radius: 999px; font-weight: 800; font-size: 11px; }
  .pill.ok    { background: #dcfce7; color: #065f46; }
  .pill.plus  { background: #dbeafe; color: #1d4ed8; }
  .pill.minus { background: #ffe4e6; color: #be123c; }
  .signature { margin-top: 36px; display: grid; grid-template-columns: 1fr 1fr; gap: 36px; }
  .signature .box { border-top: 1px solid #94a3b8; padding-top: 6px; font-size: 11px; color: #475569; text-align: center; }
  .footer { margin-top: 30px; text-align: center; font-size: 10px; color: #94a3b8; }
  .notes { margin-top: 8px; padding: 10px 12px; background: #fffbeb; border-left: 3px solid #f59e0b; font-size: 12px; color: #78350f; border-radius: 4px; }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
  <div class="header">
    <div>
      <h1>${o.restaurantName || 'ŞefPOS'}</h1>
      <div class="meta">
        ${o.branchName ? `Şube: <b>${o.branchName}</b><br/>` : ''}
        İşgünü: <b>${formatBusinessDateTR(s.business_date)}</b>
      </div>
    </div>
    <div style="text-align:right">
      <span class="badge">${title}</span>
      <h1 style="margin-top:6px">${s.shift_name}</h1>
      <div class="meta">${o.userName || ''}</div>
    </div>
  </div>

  <h2>Vardiya Bilgileri</h2>
  <div class="grid">
    <div class="card"><div class="label">Açılış</div><div class="value">${new Date(s.opened_at).toLocaleString('tr-TR')}</div></div>
    <div class="card"><div class="label">Kapanış</div><div class="value">${s.closed_at ? new Date(s.closed_at).toLocaleString('tr-TR') : '—'}</div></div>
    <div class="card"><div class="label">Süre</div><div class="value">${shiftDuration(s.opened_at, s.closed_at)}</div></div>
    <div class="card"><div class="label">Sipariş Sayısı</div><div class="value">${s.order_count}</div></div>
  </div>

  <h2>Satış Özeti</h2>
  <table>
    <thead><tr><th>Yöntem</th><th class="right">Tutar</th><th class="right">Oran</th></tr></thead>
    <tbody>
      ${(() => {
        const total = s.total_revenue || 1;
        const rows: [string, number][] = [
          ['Nakit', s.cash_revenue],
          ['Kredi Kartı', s.card_revenue],
          ['Cari Hesap', s.open_account_revenue],
        ];
        return rows.map(([k, v]) => `<tr><td>${k}</td><td class="right">${fmt(v)} ₺</td><td class="right">${total > 0 ? ((v / total) * 100).toFixed(1) : '0.0'}%</td></tr>`).join('');
      })()}
      <tr class="total"><td>TOPLAM CİRO</td><td class="right">${fmt(s.total_revenue)} ₺</td><td class="right">100%</td></tr>
    </tbody>
  </table>

  <h2>Kasa Hareketleri</h2>
  <table>
    <tbody>
      <tr><td>Açılış Nakit</td><td class="right">${fmt(s.opening_cash)} ₺</td></tr>
      <tr><td>(+) Nakit Satış</td><td class="right">${fmt(s.cash_revenue)} ₺</td></tr>
      <tr><td>(+) Nakit Giriş</td><td class="right">${fmt(s.cash_in_total)} ₺</td></tr>
      <tr><td>(−) Nakit Çıkış</td><td class="right">${fmt(s.cash_out_total)} ₺</td></tr>
      <tr><td>(−) Giderler</td><td class="right">${fmt(s.expense_total)} ₺</td></tr>
      <tr class="total"><td>BEKLENEN KASA</td><td class="right">${fmt(s.expected_cash)} ₺</td></tr>
      <tr><td>Sayılan Kapanış Nakit</td><td class="right">${fmt(s.closing_cash || 0)} ₺</td></tr>
      <tr><td>FARK</td><td class="right"><span class="pill ${diffClass}">${s.cash_difference >= 0 ? '+' : ''}${fmt(s.cash_difference)} ₺</span></td></tr>
    </tbody>
  </table>

  ${s.closing_notes ? `<div class="notes"><b>Not:</b> ${s.closing_notes}</div>` : ''}

  <div class="signature">
    <div class="box">Vardiyayı Açan / Kapatan</div>
    <div class="box">Yetkili / Müdür</div>
  </div>

  <div class="footer">${o.footer || `Sistem tarafından ${new Date().toLocaleString('tr-TR')} oluşturuldu`}</div>
  <script>window.addEventListener('load', () => { setTimeout(() => window.print(), 250); });</script>
</body>
</html>`;
}

/** Yardimci: secilen formata gore yazdirir. 80mm: printer fis akisi (Electron/print agent). A4: yeni window + window.print(). */
export async function printShiftReport(shift: ShiftReportInput, opts: BuildOpts, format: ShiftPrintFormat): Promise<{ success: boolean; error?: string }> {
  if (format === 'a4') {
    try {
      const html = buildShiftA4Html(shift, opts);
      const w = window.open('', 'sefpos-shift-a4', 'width=900,height=1200');
      if (!w) {
        return { success: false, error: 'Tarayıcı açılır pencereyi engelledi. Pop-up izni verin ve tekrar deneyin.' };
      }
      w.document.open();
      w.document.write(html);
      w.document.close();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'A4 yazdırma başarısız' };
    }
  }
  const ps = loadPrintSettings();
  const html = buildShift80mmHtml(shift, opts);
  if (getAdisyonPrinterName(ps)) {
    return printToAdisyonPrinter(ps, html);
  }
  return printHtml(html, '');
}

const PREF_KEY = 'sefpos_shift_print_format';

export function loadShiftPrintFormat(): ShiftPrintFormat {
  try {
    const raw = localStorage.getItem(PREF_KEY);
    if (raw === '80mm' || raw === 'a4') return raw;
  } catch {
    /* ignore */
  }
  return '80mm';
}

export function saveShiftPrintFormat(f: ShiftPrintFormat) {
  try {
    localStorage.setItem(PREF_KEY, f);
  } catch {
    /* ignore */
  }
}
