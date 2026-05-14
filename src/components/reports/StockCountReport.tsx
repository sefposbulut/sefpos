import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ClipboardList, Loader2, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
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

function summarizeBatch(lines: MovementRow[]) {
  let plusQty = 0;
  let minusQty = 0;
  let plusTutar = 0;
  let minusTutar = 0;
  for (const row of lines) {
    const q = Number(row.quantity || 0);
    const uc = row.unit_cost != null ? Number(row.unit_cost) : 0;
    const lineTutar = uc > 0 ? q * uc : 0;
    if (row.movement_type === 'in') {
      plusQty += q;
      plusTutar += lineTutar;
    } else if (row.movement_type === 'out') {
      minusQty += q;
      minusTutar += lineTutar;
    }
  }
  return { plusQty, minusQty, plusTutar, minusTutar, netTutar: plusTutar - minusTutar };
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [postByRef, setPostByRef] = useState<Record<string, MovementRow[]>>({});
  const [postLoadingRef, setPostLoadingRef] = useState<string | null>(null);
  const [postErrByRef, setPostErrByRef] = useState<Record<string, string>>({});
  const [expandedPostRef, setExpandedPostRef] = useState<Record<string, boolean>>({});
  const postLoadedRef = useRef(new Set<string>());

  const load = useCallback(async () => {
    if (!tenant?.id) return;
    setLoading(true);
    setError(null);
    postLoadedRef.current.clear();
    setPostByRef({});
    setPostErrByRef({});
    setExpandedPostRef({});
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
        return;
      }
      const { data: prods, error: pErr } = await supabase
        .from('products')
        .select('id,name')
        .eq('tenant_id', tenant.id)
        .in('id', ids);
      if (pErr) throw new Error(pErr.message);
      const map: Record<string, string> = {};
      (prods || []).forEach((p: any) => {
        map[p.id] = p.name;
      });
      setProductNames(map);
    } catch (e: any) {
      setError(e?.message || 'Yükleme hatası');
      setRows([]);
      setProductNames({});
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
            .select('id,name')
            .eq('tenant_id', tenant.id)
            .in('id', extraIds);
          setProductNames((prev) => {
            const n = { ...prev };
            (prods || []).forEach((p: any) => {
              if (!n[p.id]) n[p.id] = p.name;
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
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-900 flex items-center gap-2">
              <ClipboardList className="w-7 h-7 text-amber-600" />
              Sayım raporu
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Ürün sayımından uygulanan stok düzeltmeleri; her belgede fark özeti ve isteğe bağlı sayım sonrası
              hareketler (satış, transfer vb.) listelenir.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white border-2 border-slate-200 text-slate-700 text-sm font-bold hover:border-amber-300 active:scale-95 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Yenile
          </button>
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
            Bu aralıkta sayım kaydı yok. Ürün sayımını <strong>Stok yönetimi</strong> ekranından uyguladığınızda burada
            listelenir.
          </div>
        ) : (
          <div className="space-y-4">
            {batches.map(({ ref, lines }) => {
              const first = lines[0];
              const isSayim = /^SAYIM-\d+$/.test(ref);
              const isSym = ref.startsWith('SYM-');
              const title = isSayim
                ? `Sayım belgesi ${ref}`
                : isSym
                  ? `Sayım (eski format) ${ref}`
                  : `Tekil kayıt (${first?.id?.slice(0, 8) || ''})`;
              const when = first ? new Date(first.created_at).toLocaleString('tr-TR') : '';
              const sum = summarizeBatch(lines);
              const postOpen = !!expandedPostRef[ref];
              const postRows = postByRef[ref];
              const postErr = postErrByRef[ref];

              return (
                <div
                  key={ref}
                  className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden"
                >
                  <div className="px-4 py-3 bg-amber-50/80 border-b border-amber-100 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="font-black text-slate-800">{title}</div>
                      <div className="text-xs text-slate-600 font-semibold mt-0.5">
                        {when} · {lines.length} ürün satırı
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 text-[11px] font-bold">
                      <span className="px-2 py-1 rounded-lg bg-emerald-100 text-emerald-900">
                        Giriş +{sum.plusQty.toFixed(2)} → {moneyTR(sum.plusTutar)}
                      </span>
                      <span className="px-2 py-1 rounded-lg bg-rose-100 text-rose-900">
                        Çıkış −{sum.minusQty.toFixed(2)} → {moneyTR(sum.minusTutar)}
                      </span>
                      <span className="px-2 py-1 rounded-lg bg-slate-100 text-slate-800">
                        Net {moneyTR(sum.netTutar)}
                      </span>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50 text-left text-xs font-bold text-slate-600 uppercase tracking-wide">
                          <th className="p-3">Ürün</th>
                          <th className="p-3">Şube</th>
                          <th className="p-3">İşlem</th>
                          <th className="p-3 text-right">Miktar</th>
                          <th className="p-3 text-right">Birim maliyet</th>
                          <th className="p-3 text-right">Tutar (±)</th>
                          <th className="p-3">Not</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lines.map((row) => {
                          const q = Number(row.quantity || 0);
                          const uc = row.unit_cost != null ? Number(row.unit_cost) : 0;
                          const lineTutar =
                            row.movement_type === 'in' ? q * uc : row.movement_type === 'out' ? -(q * uc) : 0;
                          return (
                            <tr key={row.id} className="border-t border-slate-100">
                              <td className="p-3 font-medium text-slate-800">
                                {productNames[row.product_id] || row.product_id}
                              </td>
                              <td className="p-3 text-slate-600">{branchLabel(row, branches || [])}</td>
                              <td className="p-3">
                                {row.movement_type === 'in' ? (
                                  <span className="text-emerald-700 font-bold">Giriş</span>
                                ) : row.movement_type === 'out' ? (
                                  <span className="text-rose-700 font-bold">Çıkış</span>
                                ) : (
                                  row.movement_type
                                )}
                              </td>
                              <td className="p-3 text-right font-mono">{Number(row.quantity || 0).toFixed(2)}</td>
                              <td className="p-3 text-right text-slate-600">
                                {row.unit_cost != null ? `${Number(row.unit_cost).toFixed(2)} ₺` : '—'}
                              </td>
                              <td
                                className={`p-3 text-right font-mono text-xs font-bold ${
                                  lineTutar > 0 ? 'text-emerald-700' : lineTutar < 0 ? 'text-red-600' : 'text-slate-400'
                                }`}
                              >
                                {uc <= 0 ? '—' : `${lineTutar >= 0 ? '+' : ''}${moneyTR(lineTutar)}`}
                              </td>
                              <td className="p-3 text-slate-600 max-w-md truncate" title={row.note || ''}>
                                {row.note || '—'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

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
                        {postErr && (
                          <div className="text-sm text-red-600 py-2">{postErr}</div>
                        )}
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
