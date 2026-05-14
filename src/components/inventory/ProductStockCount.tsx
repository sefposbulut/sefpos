import { useCallback, useEffect, useMemo, useState } from 'react';
import { ClipboardList, Search, CheckCircle2, Loader2, AlertTriangle, X, Printer } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

type Category = { id: string; name: string };
type ProductRow = {
  id: string;
  name: string;
  unit: string;
  category_id: string;
  barcode: string | null;
  stock_quantity: number;
  cost: number;
};

type SessionReportRow = {
  productName: string;
  unit: string;
  sys: number;
  counted: number;
  delta: number;
  tutarSigned: number;
};

type SessionReport = {
  referenceNo: string;
  seq: number | null;
  branchName: string;
  createdAtLabel: string;
  rows: SessionReportRow[];
  totals: {
    plusQty: number;
    minusQty: number;
    plusTutar: number;
    minusTutar: number;
  };
  /** false ise veritabanında SAYIM-XXXXX RPC yok; zaman damgalı SYM- referans kullanıldı */
  usedSequentialDoc: boolean;
};

function symRefNo(): string {
  const t = new Date();
  const y = t.getFullYear();
  const m = String(t.getMonth() + 1).padStart(2, '0');
  const d = String(t.getDate()).padStart(2, '0');
  const hh = String(t.getHours()).padStart(2, '0');
  const mm = String(t.getMinutes()).padStart(2, '0');
  const ss = String(t.getSeconds()).padStart(2, '0');
  return `SYM-${y}${m}${d}-${hh}${mm}${ss}`;
}

/** `true` iken `create_stock_count_batch` RPC çağrılır (SAYIM-00001). Varsayılan kapalı → POST/404 yok. */
const STOCK_COUNT_BATCH_RPC_ENABLED = import.meta.env.VITE_STOCK_COUNT_BATCH_RPC === 'true';

function isMissingStockCountBatchRpc(err: any | null): boolean {
  if (!err) return false;
  const status = Number(err.status ?? err.statusCode ?? 0);
  if (status === 404) return true;
  const code = String(err.code ?? '').toUpperCase();
  if (['42883', 'PGRST202', 'PGRST301', 'PGRST116'].includes(code)) return true;
  const msg = String(err.message ?? '').toLowerCase();
  const details = String(err.details ?? '').toLowerCase();
  const blob = `${msg} ${details}`;
  if (blob.includes('could not find the function')) return true;
  if (blob.includes('not found') && (blob.includes('rpc') || blob.includes('function') || blob.includes('procedure')))
    return true;
  if (!blob.includes('create_stock_count_batch')) return false;
  return (
    blob.includes('does not exist') ||
    blob.includes('unknown function') ||
    blob.includes('could not find') ||
    blob.includes('schema cache') ||
    blob.includes('not found')
  );
}

const SKIP_STOCK_COUNT_RPC_SS = 'sefpos_skip_create_stock_count_batch';

function readSkipStockCountRpcSession(): boolean {
  try {
    return sessionStorage.getItem(SKIP_STOCK_COUNT_RPC_SS) === '1';
  } catch {
    return false;
  }
}

function writeSkipStockCountRpcSession() {
  try {
    sessionStorage.setItem(SKIP_STOCK_COUNT_RPC_SS, '1');
  } catch {
    /* noop */
  }
}

function clearSkipStockCountRpcSession() {
  try {
    sessionStorage.removeItem(SKIP_STOCK_COUNT_RPC_SS);
  } catch {
    /* noop */
  }
}

function moneyTR(n: number) {
  const v = Number.isFinite(n) ? n : 0;
  return `${v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺`;
}

export function ProductStockCount() {
  const { tenant, activeBranch, branches, profile } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [branchId, setBranchId] = useState<string>('');
  const [categoryId, setCategoryId] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [branchMap, setBranchMap] = useState<Record<string, number>>({});
  const [branchStockOk, setBranchStockOk] = useState(true);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [sessionReport, setSessionReport] = useState<SessionReport | null>(null);

  useEffect(() => {
    if (activeBranch?.id) setBranchId(activeBranch.id);
  }, [activeBranch?.id]);

  const loadCategories = useCallback(async () => {
    if (!tenant?.id) return;
    const { data } = await supabase
      .from('categories')
      .select('id, name')
      .eq('tenant_id', tenant.id)
      .order('sort_order', { ascending: true });
    setCategories((data as Category[]) || []);
  }, [tenant?.id]);

  const loadProducts = useCallback(async () => {
    if (!tenant?.id) return;
    const { data, error } = await supabase
      .from('products')
      .select('id, name, unit, category_id, barcode, stock_quantity, cost')
      .eq('tenant_id', tenant.id)
      .eq('is_active', true)
      .order('name', { ascending: true });
    if (error) {
      console.error('[sayim] urunler', error);
      setProducts([]);
      return;
    }
    setProducts((data as ProductRow[]) || []);
  }, [tenant?.id]);

  const loadBranchStocks = useCallback(async () => {
    if (!tenant?.id || !branchId) return;
    const { data, error } = await supabase
      .from('branch_product_stocks')
      .select('product_id, quantity')
      .eq('tenant_id', tenant.id)
      .eq('branch_id', branchId);
    if (error) {
      const msg = String((error as any)?.message || '').toLowerCase();
      const code = String((error as any)?.code || '');
      const missing =
        code === 'pgrst205' ||
        code === '42p01' ||
        msg.includes('branch_product_stocks') ||
        msg.includes('does not exist');
      if (missing) {
        setBranchStockOk(false);
        setBranchMap({});
        return;
      }
      setBranchMap({});
      return;
    }
    setBranchStockOk(true);
    const m: Record<string, number> = {};
    (data || []).forEach((r: any) => {
      m[r.product_id] = Number(r.quantity || 0);
    });
    setBranchMap(m);
  }, [tenant?.id, branchId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!tenant?.id) return;
      setLoading(true);
      await loadCategories();
      await loadProducts();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [tenant?.id, loadCategories, loadProducts]);

  useEffect(() => {
    void loadBranchStocks();
  }, [loadBranchStocks]);

  const systemQty = useCallback(
    (p: ProductRow) => {
      if (!branchStockOk) return Number(p.stock_quantity || 0);
      const b = branchMap[p.id];
      if (b !== undefined) return Number(b || 0);
      if ((branches?.length || 0) > 1) return 0;
      return Number(p.stock_quantity || 0);
    },
    [branchMap, branchStockOk, branches?.length],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (categoryId !== 'all' && p.category_id !== categoryId) return false;
      if (!q) return true;
      const bc = (p.barcode || '').toLowerCase();
      return p.name.toLowerCase().includes(q) || bc.includes(q);
    });
  }, [products, categoryId, search]);

  const setCount = (productId: string, raw: string) => {
    setCounts((prev) => ({ ...prev, [productId]: raw.replace(',', '.') }));
  };

  const clearCounts = () => setCounts({});

  const linesToApply = useMemo(() => {
    const out: { product: ProductRow; counted: number; sys: number; delta: number }[] = [];
    for (const p of filtered) {
      const raw = (counts[p.id] || '').trim();
      if (raw === '') continue;
      const counted = Number(raw);
      if (!Number.isFinite(counted) || counted < 0) continue;
      const sys = systemQty(p);
      const delta = counted - sys;
      if (Math.abs(delta) < 0.0001) continue;
      out.push({ product: p, counted, sys, delta });
    }
    return out;
  }, [filtered, counts, systemQty]);

  const upsertBranch = async (bid: string, productId: string, qty: number) => {
    if (!tenant?.id) return;
    const { error } = await supabase.from('branch_product_stocks').upsert(
      {
        tenant_id: tenant.id,
        branch_id: bid,
        product_id: productId,
        quantity: Number(qty.toFixed(2)),
      },
      { onConflict: 'tenant_id,branch_id,product_id' },
    );
    if (error) throw error;
  };

  const printSessionReport = (rep: SessionReport) => {
    const rowsHtml = rep.rows
      .map(
        (r) => `
      <tr>
        <td>${escapeHtml(r.productName)}</td>
        <td class="r">${r.sys.toFixed(2)}</td>
        <td class="r">${r.counted.toFixed(2)}</td>
        <td class="r ${r.delta >= 0 ? 'pos' : 'neg'}">${r.delta >= 0 ? '+' : ''}${r.delta.toFixed(2)}</td>
        <td class="r ${r.tutarSigned >= 0 ? 'pos' : 'neg'}">${r.tutarSigned >= 0 ? '+' : ''}${moneyTR(r.tutarSigned)}</td>
      </tr>`,
      )
      .join('');
    const w = window.open('', '_blank', 'width=900,height=700');
    if (!w) {
      alert('Açılır pencere engellendi; yazdırmak için izin verin.');
      return;
    }
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Sayım — ${escapeHtml(rep.referenceNo)}</title>
      <style>
        body{font-family:system-ui,sans-serif;padding:24px;color:#1e293b}
        h1{font-size:20px;margin:0 0 8px}
        .meta{font-size:13px;color:#64748b;margin-bottom:20px}
        table{width:100%;border-collapse:collapse;font-size:13px}
        th,td{border:1px solid #e2e8f0;padding:8px;text-align:left}
        th{background:#f8fafc;font-weight:700}
        .r{text-align:right;font-variant-numeric:tabular-nums}
        .pos{color:#047857}.neg{color:#b91c1c}
        .sum{margin-top:16px;font-size:14px}
      </style></head><body>
      <h1>Sayım fark raporu</h1>
      <div class="meta">Belge: <b>${escapeHtml(rep.referenceNo)}</b> · ${escapeHtml(rep.branchName)} · ${escapeHtml(rep.createdAtLabel)}</div>
      ${!rep.usedSequentialDoc ? '<p style="font-size:12px;color:#b45309;margin:8px 0 0">Not: Geçici SYM referansı. Sıralı SAYIM için: Supabase migration (stock_count_batches) + üretim build&apos;inde VITE_STOCK_COUNT_BATCH_RPC=true.</p>' : ''}
      <table><thead><tr><th>Ürün</th><th>Sistem</th><th>Sayım</th><th>Fark</th><th>Tutar (±)</th></tr></thead>
      <tbody>${rowsHtml}</tbody></table>
      <div class="sum">
        Giriş (fazla): +${rep.totals.plusQty.toFixed(2)} birim → ${moneyTR(rep.totals.plusTutar)}<br>
        Çıkış (eksik): −${rep.totals.minusQty.toFixed(2)} birim → ${moneyTR(rep.totals.minusTutar)}<br>
        <b>Net tutar etkisi:</b> ${moneyTR(rep.totals.plusTutar - rep.totals.minusTutar)}
      </div>
      <p style="margin-top:24px;font-size:11px;color:#94a3b8">ŞefPOS — ürün sayımı</p>
      <script>window.onload=function(){window.print();}</script>
      </body></html>`);
    w.document.close();
  };

  const apply = async () => {
    if (!tenant?.id || !branchId) return;
    if (linesToApply.length === 0) {
      alert('Uygulanacak fark yok. Sayım sütununa gerçek stok miktarlarını girin.');
      return;
    }
    if (!branchStockOk) {
      if (!confirm('Şube stok tablosu yok; yalnızca merkez ürün stoku (products.stock_quantity) güncellenecek. Devam?')) return;
    } else if ((branches?.length || 0) > 1) {
      if (
        !confirm(
          `${linesToApply.length} ürün için seçili şubede stok sayım farkı uygulanacak. Onaylıyor musunuz?`,
        )
      )
        return;
    } else if (!confirm(`${linesToApply.length} ürün için stok sayım farkı uygulanacak. Onaylıyor musunuz?`)) return;

    setApplying(true);
    const branchName = branches?.find((b) => b.id === branchId)?.name || 'Şube';
    const noteBase = `Ürün sayımı (${branchName})`;

    let refNo = '';
    let seqNum: number | null = null;
    let usedSequentialDoc = true;

    try {
      if (!STOCK_COUNT_BATCH_RPC_ENABLED) {
        refNo = symRefNo();
        seqNum = null;
        usedSequentialDoc = false;
      } else if (readSkipStockCountRpcSession()) {
        refNo = symRefNo();
        seqNum = null;
        usedSequentialDoc = false;
      } else {
        const { data: batchRows, error: batchErr } = await supabase.rpc('create_stock_count_batch', {
          p_tenant_id: tenant.id,
          p_branch_id: branchId,
        } as any);

        if (batchErr) {
          if (isMissingStockCountBatchRpc(batchErr)) {
            writeSkipStockCountRpcSession();
            refNo = symRefNo();
            seqNum = null;
            usedSequentialDoc = false;
          } else {
            throw new Error(batchErr.message || 'Belge numarası oluşturulamadı.');
          }
        } else {
          const br = Array.isArray(batchRows) ? batchRows[0] : batchRows;
          refNo = String((br as any)?.reference_no || '').trim();
          seqNum = typeof (br as any)?.seq === 'number' ? (br as any).seq : null;
          if (!refNo) {
            refNo = symRefNo();
            seqNum = null;
            usedSequentialDoc = false;
          } else {
            clearSkipStockCountRpcSession();
          }
        }
      }

      for (const line of linesToApply) {
        const { product, counted, sys, delta } = line;
        const movementType = delta > 0 ? 'in' : 'out';
        const qty = Math.abs(delta);

        if (branchStockOk) {
          await upsertBranch(branchId, product.id, counted);
        }

        const isMultiBranch = (branches?.length || 0) > 1;
        if (!isMultiBranch || !branchStockOk) {
          const { error: pErr } = await supabase
            .from('products')
            .update({ stock_quantity: counted })
            .eq('id', product.id)
            .eq('tenant_id', tenant.id);
          if (pErr) throw new Error(`${product.name}: ${pErr.message}`);
        }

        const unitCost = Number(product.cost);
        const { error: mErr } = await supabase.from('stock_movements').insert({
          tenant_id: tenant.id,
          product_id: product.id,
          movement_type: movementType,
          quantity: qty,
          unit_cost: Number.isFinite(unitCost) && unitCost > 0 ? unitCost : null,
          total_cost: null,
          supplier_name: null,
          note: `${noteBase} — sistem ${sys} → sayım ${counted}`,
          created_by: profile?.id || null,
          source_branch_id: delta < 0 ? branchId : null,
          target_branch_id: delta > 0 ? branchId : null,
          reference_type: 'stock_count',
          reference_no: refNo,
        } as any);
        if (mErr) throw new Error(`${product.name} hareket: ${mErr.message}`);
      }

      await loadProducts();
      await loadBranchStocks();
      clearCounts();

      const reportRows: SessionReportRow[] = linesToApply.map(({ product, counted, sys, delta }) => {
        const uc = Number(product.cost);
        const c = Number.isFinite(uc) && uc > 0 ? uc : 0;
        const tutarSigned = delta * c;
        return {
          productName: product.name,
          unit: product.unit || 'adet',
          sys,
          counted,
          delta,
          tutarSigned,
        };
      });
      let plusQty = 0;
      let minusQty = 0;
      let plusTutar = 0;
      let minusTutar = 0;
      for (const r of reportRows) {
        if (r.delta > 0) {
          plusQty += r.delta;
          plusTutar += r.tutarSigned;
        } else if (r.delta < 0) {
          minusQty += -r.delta;
          minusTutar += -r.tutarSigned;
        }
      }
      const createdAtLabel = new Date().toLocaleString('tr-TR');
      setSessionReport({
        referenceNo: refNo,
        seq: seqNum,
        branchName,
        createdAtLabel,
        rows: reportRows,
        totals: { plusQty, minusQty, plusTutar, minusTutar },
        usedSequentialDoc,
      });
    } catch (e: any) {
      alert(e?.message || String(e));
    } finally {
      setApplying(false);
    }
  };

  if (!tenant) {
    return <div className="p-6 text-slate-600 text-sm">Oturum gerekli.</div>;
  }

  return (
    <div className="p-3 md:p-6 max-w-6xl mx-auto space-y-4">
      {sessionReport && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col border border-slate-200">
            <div className="flex items-start justify-between gap-3 p-4 border-b border-slate-100 shrink-0">
              <div>
                <h3 className="text-lg font-black text-slate-900">Sayım uygulandı — fark raporu</h3>
                <p className="text-xs text-slate-500 mt-1 font-mono">
                  Belge: <span className="font-bold text-amber-700">{sessionReport.referenceNo}</span>
                  {sessionReport.seq != null ? ` · Sıra #${sessionReport.seq}` : null} · {sessionReport.branchName}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">{sessionReport.createdAtLabel}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => printSessionReport(sessionReport)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-700 hover:bg-slate-50"
                >
                  <Printer className="w-4 h-4" />
                  Yazdır
                </button>
                <button
                  type="button"
                  onClick={() => setSessionReport(null)}
                  className="p-2 rounded-xl hover:bg-slate-100 text-slate-600"
                  aria-label="Kapat"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="p-4 overflow-y-auto flex-1 space-y-4">
              {!sessionReport.usedSequentialDoc && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950 leading-relaxed">
                  <strong>SAYIM-00001</strong> kullanılmadı; geçici <span className="font-mono font-bold">SYM-…</span>{' '}
                  referansı yazıldı. Sıralı belge için: (1) Supabase&apos;te migration{' '}
                  <span className="font-mono">20260514193000_stock_count_batches</span>, (2) üretim build&apos;inde ortam
                  değişkeni <span className="font-mono">VITE_STOCK_COUNT_BATCH_RPC=true</span> (Electron release / CI
                  zaten açar). RPC daha önce 404 verdiyse bu sekmede:{' '}
                  <span className="font-mono whitespace-nowrap">
                    sessionStorage.removeItem(&apos;sefpos_skip_create_stock_count_batch&apos;)
                  </span>
                </div>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-2 py-3">
                  <div className="text-[10px] font-bold text-emerald-800 uppercase">Giriş (fazla)</div>
                  <div className="text-sm font-black text-emerald-900">+{sessionReport.totals.plusQty.toFixed(2)}</div>
                  <div className="text-xs text-emerald-700 font-semibold">{moneyTR(sessionReport.totals.plusTutar)}</div>
                </div>
                <div className="rounded-xl bg-rose-50 border border-rose-100 px-2 py-3">
                  <div className="text-[10px] font-bold text-rose-800 uppercase">Çıkış (eksik)</div>
                  <div className="text-sm font-black text-rose-900">−{sessionReport.totals.minusQty.toFixed(2)}</div>
                  <div className="text-xs text-rose-700 font-semibold">{moneyTR(sessionReport.totals.minusTutar)}</div>
                </div>
                <div className="rounded-xl bg-slate-50 border border-slate-200 px-2 py-3 col-span-2">
                  <div className="text-[10px] font-bold text-slate-600 uppercase">Net tutar (maliyet)</div>
                  <div className="text-lg font-black text-slate-900">
                    {moneyTR(sessionReport.totals.plusTutar - sessionReport.totals.minusTutar)}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1">Birim maliyet × fark (yaklaşık)</div>
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-bold text-slate-600 uppercase">
                    <tr>
                      <th className="p-2">Ürün</th>
                      <th className="p-2 text-right">Sistem</th>
                      <th className="p-2 text-right">Sayım</th>
                      <th className="p-2 text-right">Fark</th>
                      <th className="p-2 text-right">± Tutar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessionReport.rows.map((r, i) => (
                      <tr key={i} className="border-t border-slate-100">
                        <td className="p-2 font-medium text-slate-800">
                          {r.productName}
                          <span className="text-slate-400 font-normal text-xs ml-1">({r.unit})</span>
                        </td>
                        <td className="p-2 text-right font-mono">{r.sys.toFixed(2)}</td>
                        <td className="p-2 text-right font-mono">{r.counted.toFixed(2)}</td>
                        <td
                          className={`p-2 text-right font-mono font-bold ${r.delta >= 0 ? 'text-emerald-700' : 'text-red-600'}`}
                        >
                          {r.delta >= 0 ? '+' : ''}
                          {r.delta.toFixed(2)}
                        </td>
                        <td
                          className={`p-2 text-right font-mono text-xs ${r.tutarSigned >= 0 ? 'text-emerald-700' : 'text-red-600'}`}
                        >
                          {r.tutarSigned >= 0 ? '+' : ''}
                          {moneyTR(r.tutarSigned)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-slate-500">
                Sayım sonrası satış, transfer ve diğer stok hareketlerini görmek için{' '}
                <strong>Raporlar → Sayım raporu</strong> ekranında bu belgeyi açıp &quot;Sayım sonrası hareketler&quot;i
                genişletin.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow shrink-0">
            <ClipboardList className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg md:text-xl font-black text-slate-800">Ürün sayımı</h2>
            <p className="text-xs md:text-sm text-slate-600 mt-0.5 leading-relaxed max-w-xl">
              Şubedeki gerçek miktarı girin; sistem stoku ile farkı hesaplar. Onayda stok güncellenir; varsayılan olarak
              zaman damgalı <span className="font-mono text-slate-700">SYM-…</span> referansı ile hareket kaydı oluşur.
              Sıralı <span className="font-mono text-slate-700">SAYIM-00001</span> için hem Supabase migration (
              <span className="font-mono text-xs">20260514193000_stock_count_batches</span>) hem build ortamında{' '}
              <span className="font-mono text-xs">VITE_STOCK_COUNT_BATCH_RPC=true</span> gerekir. Ardından fark raporu
              gösterilir.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={clearCounts}
            className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-700 hover:bg-slate-50"
          >
            Sayım alanını temizle
          </button>
          <button
            type="button"
            disabled={applying || linesToApply.length === 0}
            onClick={() => void apply()}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 text-white text-sm font-black shadow disabled:opacity-50"
          >
            {applying ? 'Uygulanıyor…' : `Farkları uygula (${linesToApply.length})`}
          </button>
        </div>
      </div>

      {!branchStockOk && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            <strong>Şube stok tablosu</strong> bu projede yok veya erişilemiyor. Sayım yalnızca ürün kartındaki merkez
            stok alanına yazılır.
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <label className="block text-xs font-bold text-slate-600">
          Şube
          <select
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold"
          >
            {(branches || []).map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
                {b.is_main ? ' (Ana)' : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-bold text-slate-600">
          Kategori
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold"
          >
            <option value="all">Tümü</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <div className="relative">
          <Search className="absolute left-3 top-[26px] w-4 h-4 text-slate-400" />
          <label className="block text-xs font-bold text-slate-600 mb-1">Ara</label>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Ürün veya barkod"
            className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto max-h-[min(70vh,560px)] overflow-y-auto">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 z-10">
              <tr className="text-left text-xs font-black text-slate-600 uppercase tracking-wide">
                <th className="px-3 py-2">Ürün</th>
                <th className="px-3 py-2 w-20">Birim</th>
                <th className="px-3 py-2 w-24 text-right">Sistem</th>
                <th className="px-3 py-2 w-28">Sayım</th>
                <th className="px-3 py-2 w-24 text-right">Fark</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                    <Loader2 className="w-6 h-6 animate-spin inline mr-2" />
                    Yükleniyor…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                    Bu filtreye uygun ürün yok.
                  </td>
                </tr>
              ) : (
                filtered.map((p) => {
                  const sys = systemQty(p);
                  const raw = (counts[p.id] || '').trim();
                  const counted = raw === '' ? null : Number(raw.replace(',', '.'));
                  const diff =
                    counted != null && Number.isFinite(counted) ? counted - sys : null;
                  const diffCls =
                    diff == null || Math.abs(diff) < 0.0001
                      ? 'text-slate-400'
                      : diff > 0
                        ? 'text-emerald-700 font-bold'
                        : 'text-red-600 font-bold';
                  return (
                    <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50/80">
                      <td className="px-3 py-2">
                        <div className="font-bold text-slate-800">{p.name}</div>
                        {p.barcode ? (
                          <div className="text-[11px] text-slate-500 font-mono">{p.barcode}</div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-slate-600">{p.unit || 'adet'}</td>
                      <td className="px-3 py-2 text-right font-mono text-slate-700">{sys.toFixed(2)}</td>
                      <td className="px-3 py-2">
                        <input
                          value={counts[p.id] ?? ''}
                          onChange={(e) => setCount(p.id, e.target.value)}
                          inputMode="decimal"
                          placeholder="—"
                          className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-right font-mono text-sm"
                        />
                      </td>
                      <td className={`px-3 py-2 text-right font-mono ${diffCls}`}>
                        {diff == null || !Number.isFinite(diff) ? '—' : diff.toFixed(2)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {linesToApply.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-slate-600">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          {linesToApply.length} satırda fark var; uygulayınca tek belge numarasıyla stok hareketine yazılır ve özet
          raporu açılır.
        </div>
      )}
    </div>
  );
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
