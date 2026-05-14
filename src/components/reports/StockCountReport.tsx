import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ClipboardList,
  Loader2,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  FileSpreadsheet,
  FileText,
  Printer,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

type MovementRow = {
  id: string;
  created_at: string;
  movement_type: string;
  quantity: number;
  unit_cost: number | null;
  reference_type: string | null;
  reference_no: string | null;
  note: string | null;
  source_branch_id: string | null;
  target_branch_id: string | null;
  product_id: string;
};

function branchLabel(
  row: MovementRow,
  branches: { id: string; name: string }[],
): string {
  const src = row.source_branch_id
    ? branches.find((b) => b.id === row.source_branch_id)?.name
    : null;
  const tgt = row.target_branch_id
    ? branches.find((b) => b.id === row.target_branch_id)?.name
    : null;
  if (row.movement_type === 'in' && tgt) return tgt;
  if (row.movement_type === 'out' && src) return src;
  return tgt || src || '—';
}

function refTypeLabel(t: string | null): string {
  switch (t) {
    case 'sale_order':
      return 'Satış';
    case 'branch_transfer':
      return 'Şube transferi';
    case 'purchase_entry':
      return 'Alış / giriş';
    case 'stock_count':
      return 'Sayım';
    case 'inventory_reset':
      return 'Stok sıfırlama';
    default:
      return t || 'Diğer';
  }
}

function moneyTR(n: number) {
  const v = Number.isFinite(n) ? n : 0;
  return `${v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺`;
}

/** Not metninden `sistem X → sayım Y` (ürün sayımı) ayrıştırır. */
function parseStockCountNote(note: string | null): { sys: number; counted: number } | null {
  if (!note) return null;
  const m = note.match(/sistem\s+([\d.,]+)\s*→\s*sayım\s+([\d.,]+)/i);
  if (!m) return null;
  const sys = parseFloat(String(m[1]).replace(',', '.'));
  const counted = parseFloat(String(m[2]).replace(',', '.'));
  if (!Number.isFinite(sys) || !Number.isFinite(counted)) return null;
  return { sys, counted };
}

function summarizeBatch(lines: MovementRow[]) {
  let plusQty = 0;
  let minusQty = 0;
  let plusTutar = 0;
  let minusTutar = 0;
  let plusLineCount = 0;
  let minusLineCount = 0;
  for (const row of lines) {
    const q = Number(row.quantity || 0);
    const uc = row.unit_cost != null ? Number(row.unit_cost) : 0;
    const lineTutar = uc > 0 ? q * uc : 0;
    if (row.movement_type === 'in') {
      plusQty += q;
      plusTutar += lineTutar;
      plusLineCount += 1;
    } else if (row.movement_type === 'out') {
      minusQty += q;
      minusTutar += lineTutar;
      minusLineCount += 1;
    }
  }
  return {
    plusQty,
    minusQty,
    plusTutar,
    minusTutar,
    netTutar: plusTutar - minusTutar,
    plusLineCount,
    minusLineCount,
  };
}

/** Not ayrıştırılırsa: satış fiyatı × (sayım − sistem) toplamı (yaklaşık). */
function batchSalesNet(lines: MovementRow[], productPrices: Record<string, number>): number {
  let s = 0;
  for (const row of lines) {
    const parsed = parseStockCountNote(row.note);
    if (!parsed) continue;
    const price = productPrices[row.product_id];
    if (!Number.isFinite(price) || price <= 0) continue;
    s += (parsed.counted - parsed.sys) * price;
  }
  return s;
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function safeSheetName(ref: string): string {
  const s = ref.replace(/[:\\/?*[\]]/g, '_').slice(0, 28);
  return s || 'Sayim';
}

function buildBatchSheetRows(
  lines: MovementRow[],
  branches: { id: string; name: string }[],
  productNames: Record<string, string>,
  productPrices: Record<string, number>,
): (string | number)[][] {
  const head = [
    'Ürün',
    'Şube',
    'İşlem',
    'Miktar (fark)',
    'Birim maliyet',
    'Maliyet ±',
    'Sistem (not)',
    'Sayım (not)',
    'Adet farkı',
    'Satış birim fiyatı',
    'Satış ± (tahmini)',
    'Not',
  ];
  const body = lines.map((row) => {
    const q = Number(row.quantity || 0);
    const uc = row.unit_cost != null ? Number(row.unit_cost) : 0;
    const maliyetSigned =
      row.movement_type === 'in' ? q * uc : row.movement_type === 'out' ? -(q * uc) : 0;
    const parsed = parseStockCountNote(row.note);
    const price = productPrices[row.product_id];
    const hasPrice = Number.isFinite(price) && (price as number) > 0;
    const delta = parsed ? parsed.counted - parsed.sys : row.movement_type === 'in' ? q : row.movement_type === 'out' ? -q : 0;
    const satisSigned = hasPrice ? delta * (price as number) : '';
    return [
      productNames[row.product_id] || row.product_id,
      branchLabel(row, branches),
      row.movement_type === 'in' ? 'Fazla (giriş)' : row.movement_type === 'out' ? 'Eksik (çıkış)' : row.movement_type,
      q,
      uc > 0 ? uc : '',
      uc > 0 ? maliyetSigned : '',
      parsed ? parsed.sys : '',
      parsed ? parsed.counted : '',
      parsed ? delta : '',
      hasPrice ? (price as number) : '',
      satisSigned === '' ? '' : satisSigned,
      row.note || '',
    ];
  });
  return [head, ...body];
}

function printBatchesA4(
  batches: { ref: string; lines: MovementRow[] }[],
  branches: { id: string; name: string }[],
  productNames: Record<string, string>,
  productPrices: Record<string, number>,
) {
  const blocks = batches
    .map(({ ref, lines }) => {
      const first = lines[0];
      const when = first ? new Date(first.created_at).toLocaleString('tr-TR') : '';
          const sum = summarizeBatch(lines);
          const salesNet = batchSalesNet(lines, productPrices);
          const rows = lines
        .map((row) => {
          const q = Number(row.quantity || 0);
          const uc = row.unit_cost != null ? Number(row.unit_cost) : 0;
          const mal =
            row.movement_type === 'in' ? q * uc : row.movement_type === 'out' ? -(q * uc) : 0;
          const parsed = parseStockCountNote(row.note);
          const price = productPrices[row.product_id];
          const hasP = Number.isFinite(price) && (price as number) > 0;
          const delta = parsed ? parsed.counted - parsed.sys : row.movement_type === 'in' ? q : -q;
          const sat = hasP ? delta * (price as number) : null;
          const islem =
            row.movement_type === 'in'
              ? '<span class="pos">Fazla</span>'
              : row.movement_type === 'out'
                ? '<span class="neg">Eksik</span>'
                : escapeHtml(row.movement_type);
          return `<tr>
            <td>${escapeHtml(productNames[row.product_id] || row.product_id)}</td>
            <td>${escapeHtml(branchLabel(row, branches))}</td>
            <td>${islem}</td>
            <td class="r">${q.toFixed(2)}</td>
            <td class="r">${parsed ? parsed.sys.toFixed(2) : '—'}</td>
            <td class="r">${parsed ? parsed.counted.toFixed(2) : '—'}</td>
            <td class="r ${delta >= 0 ? 'pos' : 'neg'}">${delta >= 0 ? '+' : ''}${delta.toFixed(2)}</td>
            <td class="r">${uc > 0 ? `${mal >= 0 ? '+' : ''}${moneyTR(mal)}` : '—'}</td>
            <td class="r">${sat != null ? `${sat >= 0 ? '+' : ''}${moneyTR(sat)}` : '—'}</td>
          </tr>`;
        })
        .join('');
      return `
        <section class="batch">
          <h2>${escapeHtml(ref)}</h2>
          <p class="meta">${escapeHtml(when)} · ${lines.length} kalem · Fazla ${sum.plusLineCount} / Eksik ${sum.minusLineCount} ürün · Maliyet net ${moneyTR(sum.netTutar)} · Satış (tahm.) ${moneyTR(salesNet)}</p>
          <table>
            <thead><tr>
              <th>Ürün</th><th>Şube</th><th>İşlem</th><th>Miktar</th><th>Sistem</th><th>Sayım</th><th>Fark</th><th>Maliyet ±</th><th>Satış ±</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
          <p class="sum"><b>Maliyet net:</b> ${moneyTR(sum.netTutar)}</p>
        </section>`;
    })
    .join('');
  const w = window.open('', '_blank');
  if (!w) {
    alert('Açılır pencere engellendi.');
    return;
  }
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Sayım raporu — ŞefPOS</title>
    <style>
      @page { size: A4; margin: 12mm; }
      body{font-family:system-ui,sans-serif;font-size:11px;color:#0f172a}
      h1{font-size:18px;margin:0 0 12px}
      h2{font-size:14px;margin:16px 0 6px;page-break-after:avoid}
      .meta{color:#64748b;margin:0 0 8px;font-size:11px}
      table{width:100%;border-collapse:collapse;page-break-inside:auto}
      tr{page-break-inside:avoid;page-break-after:auto}
      th,td{border:1px solid #cbd5e1;padding:5px 6px}
      th{background:#f1f5f9;font-size:10px;text-transform:uppercase}
      .r{text-align:right;font-variant-numeric:tabular-nums}
      .pos{color:#047857;font-weight:700}.neg{color:#b91c1c;font-weight:700}
      .sum{margin-top:8px;font-size:12px}
      .batch{page-break-inside:avoid;margin-bottom:20px}
    </style></head><body>
    <h1>Sayım raporu (${batches.length} belge)</h1>
    ${blocks}
    <script>window.onload=function(){window.print();}</script>
    </body></html>`);
  w.document.close();
}

function exportBatchExcel(
  ref: string,
  lines: MovementRow[],
  branches: { id: string; name: string }[],
  productNames: Record<string, string>,
  productPrices: Record<string, number>,
) {
  const aoa = buildBatchSheetRows(lines, branches, productNames, productPrices);
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, safeSheetName(ref));
  XLSX.writeFile(wb, `sayim-${safeSheetName(ref)}.xlsx`);
}

function exportAllBatchesExcel(
  batches: { ref: string; lines: MovementRow[] }[],
  branches: { id: string; name: string }[],
  productNames: Record<string, string>,
  productPrices: Record<string, number>,
) {
  const wb = XLSX.utils.book_new();
  for (const { ref, lines } of batches) {
    const aoa = buildBatchSheetRows(lines, branches, productNames, productPrices);
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    XLSX.utils.book_append_sheet(wb, ws, safeSheetName(ref));
  }
  XLSX.writeFile(wb, `sayim-raporu-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function exportBatchPdf(
  ref: string,
  lines: MovementRow[],
  branches: { id: string; name: string }[],
  productNames: Record<string, string>,
  productPrices: Record<string, number>,
) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  let y = 12;
  doc.setFontSize(14);
  doc.text(`Sayım — ${ref}`, 10, y);
  y += 8;
  doc.setFontSize(9);
  const sum = summarizeBatch(lines);
  doc.text(
    `Fazla: ${sum.plusLineCount} ürün, +${sum.plusQty.toFixed(2)} adet  |  Eksik: ${sum.minusLineCount} ürün, −${sum.minusQty.toFixed(2)} adet  |  Maliyet net: ${moneyTR(sum.netTutar)}`,
    10,
    y,
  );
  y += 6;
  const col = [8, 52, 88, 118, 138, 158, 178, 208, 248];
  doc.setFont('helvetica', 'bold');
  doc.text('Ürün', col[0], y);
  doc.text('Şube', col[1], y);
  doc.text('İşl.', col[2], y);
  doc.text('Mik.', col[3], y);
  doc.text('Sys', col[4], y);
  doc.text('Say', col[5], y);
  doc.text('Frk', col[6], y);
  doc.text('Mlyt±', col[7], y);
  doc.text('Sat±', col[8], y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  for (const row of lines) {
    if (y > 185) {
      doc.addPage();
      y = 12;
    }
    const q = Number(row.quantity || 0);
    const uc = row.unit_cost != null ? Number(row.unit_cost) : 0;
    const mal =
      row.movement_type === 'in' ? q * uc : row.movement_type === 'out' ? -(q * uc) : 0;
    const parsed = parseStockCountNote(row.note);
    const price = productPrices[row.product_id];
    const hasP = Number.isFinite(price) && (price as number) > 0;
    const delta = parsed ? parsed.counted - parsed.sys : row.movement_type === 'in' ? q : -q;
    const sat = hasP ? delta * (price as number) : null;
    const name = (productNames[row.product_id] || row.product_id).slice(0, 22);
    doc.text(name, col[0], y);
    doc.text((branchLabel(row, branches) || '—').slice(0, 14), col[1], y);
    doc.text(row.movement_type === 'in' ? '+' : row.movement_type === 'out' ? '−' : '?', col[2], y);
    doc.text(q.toFixed(2), col[3], y);
    doc.text(parsed ? parsed.sys.toFixed(1) : '—', col[4], y);
    doc.text(parsed ? parsed.counted.toFixed(1) : '—', col[5], y);
    doc.text(`${delta >= 0 ? '+' : ''}${delta.toFixed(1)}`, col[6], y);
    doc.text(uc > 0 ? moneyTR(mal).replace(' ₺', '') : '—', col[7], y);
    doc.text(sat != null ? moneyTR(sat).replace(' ₺', '') : '—', col[8], y);
    y += 5;
  }
  doc.save(`sayim-${safeSheetName(ref)}.pdf`);
}

export function StockCountReport() {
  const { tenant, branches } = useAuth();
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(today);
  const [branchId, setBranchId] = useState<string>('all');
  const [rows, setRows] = useState<MovementRow[]>([]);
  const [productNames, setProductNames] = useState<Record<string, string>>({});
  const [productPrices, setProductPrices] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [postByRef, setPostByRef] = useState<Record<string, MovementRow[]>>({});
  const [postLoadingRef, setPostLoadingRef] = useState<string | null>(null);
  const [postErrByRef, setPostErrByRef] = useState<Record<string, string>>({});
  const [expandedPostRef, setExpandedPostRef] = useState<Record<string, boolean>>({});
  const [expandedDetailRef, setExpandedDetailRef] = useState<Record<string, boolean>>({});
  const postLoadedRef = useRef(new Set<string>());

  const load = useCallback(async () => {
    if (!tenant?.id) return;
    setLoading(true);
    setError(null);
    postLoadedRef.current.clear();
    setPostByRef({});
    setPostErrByRef({});
    setExpandedPostRef({});
    setExpandedDetailRef({});
    try {
      let q = supabase
        .from('stock_movements')
        .select(
          'id,created_at,movement_type,quantity,unit_cost,reference_type,reference_no,note,source_branch_id,target_branch_id,product_id',
        )
        .eq('tenant_id', tenant.id)
        .eq('reference_type', 'stock_count')
        .order('created_at', { ascending: false })
        .limit(3000);

      if (dateFrom) {
        q = q.gte('created_at', new Date(`${dateFrom}T00:00:00`).toISOString());
      }
      if (dateTo) {
        q = q.lte('created_at', new Date(`${dateTo}T23:59:59.999`).toISOString());
      }
      if (branchId !== 'all') {
        q = q.or(`source_branch_id.eq.${branchId},target_branch_id.eq.${branchId}`);
      }

      const { data, error: qErr } = await q;
      if (qErr) throw new Error(qErr.message);
      const list = (data || []) as MovementRow[];
      setRows(list);

      const ids = [...new Set(list.map((r) => r.product_id).filter(Boolean))];
      if (ids.length === 0) {
        setProductNames({});
        setProductPrices({});
        return;
      }
      const { data: prods, error: pErr } = await supabase
        .from('products')
        .select('id,name,price')
        .eq('tenant_id', tenant.id)
        .in('id', ids);
      if (pErr) throw new Error(pErr.message);
      const map: Record<string, string> = {};
      const pmap: Record<string, number> = {};
      (prods || []).forEach((p: any) => {
        map[p.id] = p.name;
        pmap[p.id] = Number(p.price || 0);
      });
      setProductNames(map);
      setProductPrices(pmap);
    } catch (e: any) {
      setError(e?.message || 'Yükleme hatası');
      setRows([]);
      setProductNames({});
      setProductPrices({});
    } finally {
      setLoading(false);
    }
  }, [tenant?.id, dateFrom, dateTo, branchId]);

  useEffect(() => {
    void load();
  }, [load]);

  const batches = useMemo(() => {
    const map = new Map<string, MovementRow[]>();
    for (const r of rows) {
      const key = r.reference_no || `tekil-${r.id}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    const entries = [...map.entries()].map(([ref, lines]) => ({
      ref,
      lines: lines.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      ),
    }));
    entries.sort(
      (a, b) =>
        new Date(b.lines[0]?.created_at || 0).getTime() -
        new Date(a.lines[0]?.created_at || 0).getTime(),
    );
    return entries;
  }, [rows]);

  const loadPostFor = useCallback(
    async (ref: string, lines: MovementRow[]) => {
      if (!tenant?.id || lines.length === 0) return;
      if (postLoadedRef.current.has(ref)) return;
      setPostLoadingRef(ref);
      setPostErrByRef((prev) => {
        const n = { ...prev };
        delete n[ref];
        return n;
      });
      try {
        const batchIds = new Set(lines.map((l) => l.id));
        const productIds = [...new Set(lines.map((l) => l.product_id))];
        const tMs = Math.max(...lines.map((l) => new Date(l.created_at).getTime()));
        const fromIso = new Date(tMs + 1).toISOString();

        const { data, error: qErr } = await supabase
          .from('stock_movements')
          .select(
            'id,created_at,movement_type,quantity,unit_cost,reference_type,reference_no,note,source_branch_id,target_branch_id,product_id',
          )
          .eq('tenant_id', tenant.id)
          .in('product_id', productIds)
          .gt('created_at', fromIso)
          .order('created_at', { ascending: true })
          .limit(800);

        if (qErr) throw new Error(qErr.message);
        const list = ((data || []) as MovementRow[]).filter((r) => !batchIds.has(r.id));
        setPostByRef((prev) => ({ ...prev, [ref]: list }));
        postLoadedRef.current.add(ref);

        const extraIds = [...new Set(list.map((r) => r.product_id))];
        if (extraIds.length > 0) {
          const { data: prods } = await supabase
            .from('products')
            .select('id,name,price')
            .eq('tenant_id', tenant.id)
            .in('id', extraIds);
          setProductNames((prev) => {
            const n = { ...prev };
            (prods || []).forEach((p: any) => {
              if (!n[p.id]) n[p.id] = p.name;
            });
            return n;
          });
          setProductPrices((prev) => {
            const n = { ...prev };
            (prods || []).forEach((p: any) => {
              if (n[p.id] == null || n[p.id] === 0) n[p.id] = Number(p.price || 0);
            });
            return n;
          });
        }
      } catch (e: any) {
        setPostErrByRef((prev) => ({ ...prev, [ref]: e?.message || 'Yüklenemedi' }));
      } finally {
        setPostLoadingRef(null);
      }
    },
    [tenant?.id],
  );

  const handleTogglePost = (ref: string, lines: MovementRow[]) => {
    setExpandedPostRef((p) => {
      const willOpen = !p[ref];
      if (willOpen && !postLoadedRef.current.has(ref)) {
        queueMicrotask(() => void loadPostFor(ref, lines));
      }
      return { ...p, [ref]: willOpen };
    });
  };

  return (
    <div className="fixed inset-0 top-14 md:top-20 bg-gradient-to-br from-slate-50 to-slate-100 overflow-auto">
      <div className="p-4 md:p-6 max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-900 flex items-center gap-2">
              <ClipboardList className="w-7 h-7 text-amber-600" />
              Sayım raporu
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Belgeler liste halinde; satıra tıklayınca ürün detayı açılır. A4 yazdırma ve Excel/PDF dışa aktarma
              desteklenir. Özet satış tutarı, nottaki sistem/sayım bilgisinden hesaplanır.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white border-2 border-slate-200 text-slate-700 text-sm font-bold hover:border-amber-300 active:scale-95 disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Yenile
            </button>
            {batches.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() =>
                    printBatchesA4(batches, branches || [], productNames, productPrices)
                  }
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white border-2 border-slate-200 text-slate-700 text-sm font-bold hover:border-amber-300 active:scale-95"
                >
                  <Printer className="w-4 h-4" />
                  A4 yazdır
                </button>
                <button
                  type="button"
                  onClick={() =>
                    exportAllBatchesExcel(batches, branches || [], productNames, productPrices)
                  }
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-black hover:bg-emerald-700 active:scale-95 shadow"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  Excel (tümü)
                </button>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3 mb-6 bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">Başlangıç</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">Bitiş</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">Şube</label>
            <select
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm min-w-[160px]"
            >
              <option value="all">Tüm şubeler</option>
              {(branches || []).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm font-medium">
            {error}
          </div>
        )}

        {loading && rows.length === 0 ? (
          <div className="flex items-center justify-center py-20 text-slate-500 gap-2">
            <Loader2 className="w-6 h-6 animate-spin" />
            Yükleniyor…
          </div>
        ) : batches.length === 0 ? (
          <div className="text-center py-16 text-slate-500 bg-white rounded-xl border border-slate-200">
            Bu aralıkta sayım kaydı yok. <strong>Ürün sayımı</strong> menüsünden uyguladığınızda burada listelenir.
          </div>
        ) : (
          <div className="space-y-3">
            {batches.map(({ ref, lines }) => {
              const first = lines[0];
              const isSayim = /^SAYIM-\d+$/.test(ref);
              const isSym = ref.startsWith('SYM-');
              const title = isSayim
                ? `Sayım belgesi ${ref}`
                : isSym
                  ? `Sayım ${ref}`
                  : `Tekil kayıt (${first?.id?.slice(0, 8) || ''})`;
              const when = first ? new Date(first.created_at).toLocaleString('tr-TR') : '';
              const sum = summarizeBatch(lines);
              const postOpen = !!expandedPostRef[ref];
              const postRows = postByRef[ref];
              const postErr = postErrByRef[ref];
              const detailOpen = !!expandedDetailRef[ref];
              const salesNet = batchSalesNet(lines, productPrices);

              return (
                <div
                  key={ref}
                  className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => setExpandedDetailRef((p) => ({ ...p, [ref]: !p[ref] }))}
                    className="w-full text-left px-4 py-3 flex flex-wrap items-center justify-between gap-2 bg-amber-50/80 hover:bg-amber-50/95 border-b border-amber-100 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-black text-slate-800">{title}</div>
                      <div className="text-xs text-slate-600 font-semibold mt-0.5">
                        {when} · <strong>{lines.length}</strong> kalem · Fazla{' '}
                        <strong className="text-emerald-800">{sum.plusLineCount}</strong> ürün (+
                        {sum.plusQty.toFixed(2)} adet) · Eksik{' '}
                        <strong className="text-rose-800">{sum.minusLineCount}</strong> ürün (−
                        {sum.minusQty.toFixed(2)} adet)
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="hidden md:flex flex-col items-end gap-0.5 text-[10px] font-bold text-slate-700">
                        <span>
                          Maliyet net: <span className="text-slate-900">{moneyTR(sum.netTutar)}</span>
                        </span>
                        <span>
                          Satış (tahm.):{' '}
                          <span className="text-amber-800">{moneyTR(salesNet)}</span>
                        </span>
                      </div>
                      {detailOpen ? (
                        <ChevronUp className="w-5 h-5 text-slate-600 shrink-0" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-slate-600 shrink-0" />
                      )}
                    </div>
                  </button>

                  {detailOpen && (
                    <>
                      <div className="flex flex-wrap justify-end gap-2 px-3 py-2 border-b border-slate-100 bg-slate-50/60 print:hidden">
                        <button
                          type="button"
                          onClick={() =>
                            exportBatchExcel(ref, lines, branches || [], productNames, productPrices)
                          }
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50"
                        >
                          <FileSpreadsheet className="w-3.5 h-3.5" />
                          Excel
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            exportBatchPdf(ref, lines, branches || [], productNames, productPrices)
                          }
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          PDF
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            printBatchesA4([{ ref, lines }], branches || [], productNames, productPrices)
                          }
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-black hover:bg-amber-700"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          Yazdır
                        </button>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-slate-50 text-left text-xs font-bold text-slate-600 uppercase tracking-wide">
                              <th className="p-3">Ürün</th>
                              <th className="p-3">Şube</th>
                              <th className="p-3">İşlem</th>
                              <th className="p-3 text-right">Miktar</th>
                              <th className="p-3 text-right">Sistem</th>
                              <th className="p-3 text-right">Sayım</th>
                              <th className="p-3 text-right">Fark</th>
                              <th className="p-3 text-right">Satış ±</th>
                              <th className="p-3 text-right">Maliyet</th>
                              <th className="p-3 text-right">Maliyet ±</th>
                              <th className="p-3">Not</th>
                            </tr>
                          </thead>
                          <tbody>
                            {lines.map((row) => {
                              const q = Number(row.quantity || 0);
                              const uc = row.unit_cost != null ? Number(row.unit_cost) : 0;
                              const lineTutar =
                                row.movement_type === 'in'
                                  ? q * uc
                                  : row.movement_type === 'out'
                                    ? -(q * uc)
                                    : 0;
                              const parsed = parseStockCountNote(row.note);
                              const price = productPrices[row.product_id];
                              const hasP = Number.isFinite(price) && price > 0;
                              const delta = parsed
                                ? parsed.counted - parsed.sys
                                : row.movement_type === 'in'
                                  ? q
                                  : row.movement_type === 'out'
                                    ? -q
                                    : 0;
                              const satLine = hasP ? delta * price : null;
                              return (
                                <tr key={row.id} className="border-t border-slate-100">
                                  <td className="p-3 font-medium text-slate-800">
                                    {productNames[row.product_id] || row.product_id}
                                  </td>
                                  <td className="p-3 text-slate-600">{branchLabel(row, branches || [])}</td>
                                  <td className="p-3">
                                    {row.movement_type === 'in' ? (
                                      <span className="text-emerald-700 font-bold">Fazla</span>
                                    ) : row.movement_type === 'out' ? (
                                      <span className="text-rose-700 font-bold">Eksik</span>
                                    ) : (
                                      row.movement_type
                                    )}
                                  </td>
                                  <td className="p-3 text-right font-mono">{q.toFixed(2)}</td>
                                  <td className="p-3 text-right font-mono text-slate-600">
                                    {parsed ? parsed.sys.toFixed(2) : '—'}
                                  </td>
                                  <td className="p-3 text-right font-mono text-slate-600">
                                    {parsed ? parsed.counted.toFixed(2) : '—'}
                                  </td>
                                  <td
                                    className={`p-3 text-right font-mono font-bold ${
                                      delta > 0.0001
                                        ? 'text-emerald-700'
                                        : delta < -0.0001
                                          ? 'text-red-600'
                                          : 'text-slate-400'
                                    }`}
                                  >
                                    {parsed != null || row.movement_type === 'in' || row.movement_type === 'out'
                                      ? `${delta >= 0 ? '+' : ''}${delta.toFixed(2)}`
                                      : '—'}
                                  </td>
                                  <td
                                    className={`p-3 text-right font-mono text-xs font-bold ${
                                      satLine == null
                                        ? 'text-slate-400'
                                        : satLine > 0
                                          ? 'text-emerald-700'
                                          : satLine < 0
                                            ? 'text-red-600'
                                            : 'text-slate-500'
                                    }`}
                                  >
                                    {satLine == null ? '—' : `${satLine >= 0 ? '+' : ''}${moneyTR(satLine)}`}
                                  </td>
                                  <td className="p-3 text-right text-slate-600">
                                    {row.unit_cost != null ? `${Number(row.unit_cost).toFixed(2)} ₺` : '—'}
                                  </td>
                                  <td
                                    className={`p-3 text-right font-mono text-xs font-bold ${
                                      lineTutar > 0
                                        ? 'text-emerald-700'
                                        : lineTutar < 0
                                          ? 'text-red-600'
                                          : 'text-slate-400'
                                    }`}
                                  >
                                    {uc <= 0 ? '—' : `${lineTutar >= 0 ? '+' : ''}${moneyTR(lineTutar)}`}
                                  </td>
                                  <td className="p-3 text-slate-600 max-w-[200px] truncate" title={row.note || ''}>
                                    {row.note || '—'}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot className="bg-slate-100 border-t-2 border-slate-300">
                            <tr>
                              <td colSpan={7} className="p-3 text-right text-xs font-black text-slate-800">
                                Satış farkı toplamı (tahmini)
                              </td>
                              <td
                                className={`p-3 text-right font-mono text-sm font-black ${
                                  salesNet >= 0 ? 'text-emerald-800' : 'text-red-700'
                                }`}
                              >
                                {salesNet >= 0 ? '+' : ''}
                                {moneyTR(salesNet)}
                              </td>
                              <td className="p-3 text-right text-xs font-bold text-slate-600">Maliyet net</td>
                              <td className="p-3 text-right font-mono text-sm font-black text-slate-900">
                                {moneyTR(sum.netTutar)}
                              </td>
                              <td className="p-3" />
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </>
                  )}

                  <div className="border-t border-slate-100 bg-slate-50/50 px-3 py-2">
                    <button
                      type="button"
                      onClick={() => handleTogglePost(ref, lines)}
                      className="w-full flex items-center justify-between gap-2 text-left text-sm font-bold text-slate-700 hover:text-amber-800 py-2"
                    >
                      <span>Sayım sonrası hareketler (aynı ürünlerde satış, transfer, diğer)</span>
                      {postOpen ? <ChevronUp className="w-4 h-4 shrink-0" /> : <ChevronDown className="w-4 h-4 shrink-0" />}
                    </button>
                    {postOpen && (
                      <div className="pb-3">
                        {postLoadingRef === ref && (
                          <div className="flex items-center gap-2 text-slate-500 text-sm py-4 justify-center">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Yükleniyor…
                          </div>
                        )}
                        {postErr && <div className="text-sm text-red-600 py-2">{postErr}</div>}
                        {!postLoadingRef && postRows && postRows.length === 0 && !postErr && (
                          <p className="text-sm text-slate-500 py-3 text-center">
                            Bu sayımdan sonra bu ürünlerde başka stok hareketi yok (veya henüz kayıt düşmedi).
                          </p>
                        )}
                        {postRows && postRows.length > 0 && (
                          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="bg-slate-100 text-left font-bold text-slate-600">
                                  <th className="p-2">Zaman</th>
                                  <th className="p-2">Ürün</th>
                                  <th className="p-2">Tür</th>
                                  <th className="p-2">İşlem</th>
                                  <th className="p-2 text-right">Miktar</th>
                                  <th className="p-2">Ref</th>
                                </tr>
                              </thead>
                              <tbody>
                                {postRows.map((row) => (
                                  <tr key={row.id} className="border-t border-slate-100">
                                    <td className="p-2 whitespace-nowrap text-slate-600">
                                      {new Date(row.created_at).toLocaleString('tr-TR')}
                                    </td>
                                    <td className="p-2 font-medium text-slate-800">
                                      {productNames[row.product_id] || row.product_id}
                                    </td>
                                    <td className="p-2 text-slate-700">{refTypeLabel(row.reference_type)}</td>
                                    <td className="p-2">
                                      {row.movement_type === 'in' ? (
                                        <span className="text-emerald-700 font-bold">Giriş</span>
                                      ) : row.movement_type === 'out' ? (
                                        <span className="text-rose-700 font-bold">Çıkış</span>
                                      ) : (
                                        row.movement_type
                                      )}
                                    </td>
                                    <td className="p-2 text-right font-mono">{Number(row.quantity || 0).toFixed(2)}</td>
                                    <td
                                      className="p-2 font-mono text-slate-500 truncate max-w-[140px]"
                                      title={row.reference_no || ''}
                                    >
                                      {row.reference_no || '—'}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
