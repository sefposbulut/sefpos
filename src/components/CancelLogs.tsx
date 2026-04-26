import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Ban, Search, X, ChevronDown, ChevronUp, Calendar, Filter, User } from 'lucide-react';

interface CancelLog {
  id: string;
  order_id: string | null;
  order_number: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
  cancel_reason: string | null;
  cancelled_by_name: string | null;
  created_at: string;
  branch_id: string | null;
}

interface CancelLogsProps {
  onClose: () => void;
}

type QuickPeriod = 'today' | 'yesterday' | 'week' | 'month' | 'custom';

export function CancelLogs({ onClose }: CancelLogsProps) {
  const { tenant, branch } = useAuth();
  const [logs, setLogs] = useState<CancelLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 100;

  const [period, setPeriod] = useState<QuickPeriod>('today');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [startTime, setStartTime] = useState('00:00');
  const [endTime, setEndTime] = useState('23:59');
  const [staffFilter, setStaffFilter] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [staffList, setStaffList] = useState<string[]>([]);

  const getDateRange = () => {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    if (period === 'today') return { start: today, end: today };
    if (period === 'yesterday') {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      const ys = y.toISOString().split('T')[0];
      return { start: ys, end: ys };
    }
    if (period === 'week') {
      const w = new Date(now);
      w.setDate(w.getDate() - 6);
      return { start: w.toISOString().split('T')[0], end: today };
    }
    if (period === 'month') {
      const m = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start: m.toISOString().split('T')[0], end: today };
    }
    if (period === 'custom' && customStart && customEnd) {
      return { start: customStart, end: customEnd };
    }
    return { start: today, end: today };
  };

  useEffect(() => {
    if (tenant && period !== 'custom') loadLogs();
  }, [tenant, branch, sortOrder, page, period]);

  const loadLogs = async () => {
    if (!tenant) return;
    setLoading(true);

    const { start, end } = getDateRange();
    const startDT = `${start}T${startTime}:00`;
    const endDT = `${end}T${endTime}:59`;

    let query = supabase
      .from('order_cancel_logs')
      .select('*')
      .eq('tenant_id', tenant.id)
      .gte('created_at', startDT)
      .lte('created_at', endDT)
      .order('created_at', { ascending: sortOrder === 'asc' })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (branch?.id) {
      query = query.eq('branch_id', branch.id);
    }

    if (staffFilter) {
      query = query.eq('cancelled_by_name', staffFilter);
    }

    const { data } = await query;
    if (data) {
      setLogs(data as CancelLog[]);
      const names = [...new Set((data as CancelLog[]).map(l => l.cancelled_by_name).filter(Boolean) as string[])];
      setStaffList(prev => [...new Set([...prev, ...names])]);
    }
    setLoading(false);
  };

  const filtered = logs.filter(log => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      log.product_name.toLowerCase().includes(q) ||
      (log.order_number || '').toLowerCase().includes(q) ||
      (log.cancelled_by_name || '').toLowerCase().includes(q) ||
      (log.cancel_reason || '').toLowerCase().includes(q)
    );
  });

  const totalAmount = filtered.reduce((sum, log) => sum + log.unit_price * log.quantity, 0);
  const totalItems = filtered.reduce((sum, log) => sum + log.quantity, 0);

  const periodLabels: Record<QuickPeriod, string> = {
    today: 'Bugün',
    yesterday: 'Dün',
    week: 'Son 7 Gün',
    month: 'Bu Ay',
    custom: 'Özel',
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-0 md:p-4">
      <div className="bg-white w-full h-full md:rounded-2xl md:max-w-4xl md:h-[90vh] flex flex-col overflow-hidden shadow-2xl">
        <div className="bg-gradient-to-r from-red-600 to-orange-500 px-4 py-4 md:px-6 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 text-white">
            <Ban className="w-6 h-6" />
            <div>
              <h2 className="text-xl font-bold">İptal Kayıtları</h2>
              <p className="text-xs opacity-80">{filtered.length} kayıt · {totalItems} kalem</p>
            </div>
          </div>
          <button onClick={onClose} className="text-white hover:bg-white/20 p-2 rounded-xl transition active:scale-95">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="px-4 py-3 border-b bg-gray-50 space-y-2.5 shrink-0">
          <div className="flex gap-1 flex-wrap">
            {(['today', 'yesterday', 'week', 'month', 'custom'] as QuickPeriod[]).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  period === p ? 'bg-red-500 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-100'
                }`}
              >
                {periodLabels[p]}
              </button>
            ))}
          </div>

          {period === 'custom' && (
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="date"
                value={customStart}
                onChange={e => setCustomStart(e.target.value)}
                className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs bg-white"
              />
              <span className="text-gray-400 text-xs">—</span>
              <input
                type="date"
                value={customEnd}
                onChange={e => setCustomEnd(e.target.value)}
                className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs bg-white"
              />
              <button
                onClick={loadLogs}
                className="px-3 py-1.5 bg-red-500 text-white rounded-lg text-xs font-semibold hover:bg-red-600 transition"
              >
                Uygula
              </button>
            </div>
          )}

          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Ürün, sipariş no, garson ara..."
                className="w-full pl-9 pr-8 py-2 text-sm border-2 border-gray-200 rounded-xl focus:outline-none focus:border-orange-400"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <button
              onClick={() => setShowFilters(s => !s)}
              className={`flex items-center gap-1.5 px-3 py-2 border-2 rounded-xl text-sm font-medium transition ${
                showFilters || staffFilter || startTime !== '00:00' || endTime !== '23:59'
                  ? 'border-orange-400 text-orange-600 bg-orange-50'
                  : 'border-gray-200 text-gray-600 bg-white hover:border-orange-300'
              }`}
            >
              <Filter className="w-4 h-4" />
              Filtre
            </button>
            <button
              onClick={() => setSortOrder(s => s === 'desc' ? 'asc' : 'desc')}
              className="flex items-center gap-1.5 px-3 py-2 bg-white border-2 border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:border-orange-300 transition"
            >
              {sortOrder === 'desc' ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
              Tarih
            </button>
          </div>

          {showFilters && (
            <div className="bg-white border border-gray-200 rounded-xl p-3 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1 block">Başlangıç Saati</label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={e => setStartTime(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1 block">Bitiş Saati</label>
                  <input
                    type="time"
                    value={endTime}
                    onChange={e => setEndTime(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1 flex items-center gap-1">
                  <User className="w-3 h-3" /> Personel
                </label>
                <select
                  value={staffFilter}
                  onChange={e => setStaffFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
                >
                  <option value="">Tüm Personel</option>
                  {staffList.map(name => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </div>
              <button
                onClick={() => { setPage(0); loadLogs(); }}
                className="w-full py-2 bg-red-500 text-white rounded-lg text-sm font-semibold hover:bg-red-600 transition"
              >
                Filtrele
              </button>
            </div>
          )}
        </div>

        {filtered.length > 0 && (
          <div className="px-4 py-2 bg-red-50 border-b border-red-100 shrink-0">
            <div className="flex items-center justify-between text-sm">
              <span className="text-red-700 font-semibold">{filtered.length} kayıt · {totalItems} kalem iptal</span>
              <span className="text-red-700 font-black">{totalAmount.toFixed(2)} ₺</span>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <Ban className="w-12 h-12 mb-3 opacity-30" />
              <p className="text-base font-medium">İptal kaydı bulunamadı</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {filtered.map(log => (
                <div key={log.id} className="px-4 py-3 hover:bg-gray-50 transition">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-gray-800 text-sm">{log.product_name}</span>
                        <span className="bg-red-100 text-red-700 text-xs font-black px-2 py-0.5 rounded-full">x{log.quantity}</span>
                        {log.order_number && (
                          <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">#{log.order_number}</span>
                        )}
                      </div>
                      {log.cancel_reason && (
                        <div className="mt-1 text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded-lg px-2.5 py-1.5 inline-block">
                          Neden: {log.cancel_reason}
                        </div>
                      )}
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        {log.cancelled_by_name && (
                          <span className="text-xs text-gray-500 flex items-center gap-1">
                            <User className="w-3 h-3" />
                            <span className="font-semibold text-gray-700">{log.cancelled_by_name}</span>
                          </span>
                        )}
                        <span className="text-xs text-gray-400 flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(log.created_at).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-black text-red-600 text-base">{(log.unit_price * log.quantity).toFixed(2)} ₺</div>
                      <div className="text-xs text-gray-400">{log.unit_price.toFixed(2)} ₺/adet</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {logs.length === PAGE_SIZE && (
          <div className="px-4 py-3 border-t bg-gray-50 flex gap-2 shrink-0">
            {page > 0 && (
              <button onClick={() => setPage(p => p - 1)} className="flex-1 bg-white border-2 border-gray-200 text-gray-700 font-bold py-2.5 rounded-xl text-sm active:scale-95">
                Önceki
              </button>
            )}
            <button onClick={() => setPage(p => p + 1)} className="flex-1 bg-orange-500 text-white font-bold py-2.5 rounded-xl text-sm active:scale-95">
              Sonraki
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
