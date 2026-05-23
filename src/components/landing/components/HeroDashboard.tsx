import { useEffect, useMemo, useState } from 'react';

type TableStatus = 'empty' | 'occupied' | 'paying' | 'reserved';

type Table = {
  id: number;
  status: TableStatus;
  amount?: number;
  guests?: number;
};

const TABLES: Table[] = [
  { id: 1, status: 'empty' },
  { id: 2, status: 'occupied', amount: 285, guests: 4 },
  { id: 3, status: 'occupied', amount: 420, guests: 2 },
  { id: 4, status: 'reserved', guests: 6 },
  { id: 5, status: 'occupied', amount: 580, guests: 5 },
  { id: 6, status: 'paying', amount: 320, guests: 3 },
  { id: 7, status: 'empty' },
  { id: 8, status: 'occupied', amount: 156, guests: 2 },
  { id: 9, status: 'occupied', amount: 890, guests: 8 },
  { id: 10, status: 'empty' },
  { id: 11, status: 'occupied', amount: 245, guests: 3 },
  { id: 12, status: 'paying', amount: 512, guests: 4 },
];

const ONLINE_ORDERS = [
  { id: 'G-4821', platform: 'Getir', color: 'border-purple-500' },
  { id: 'YS-1092', platform: 'Yemeksepeti', color: 'border-rose-500' },
  { id: 'T-7734', platform: 'Trendyol', color: 'border-orange-400' },
];

function tableClass(status: TableStatus, isActive: boolean): string {
  const base = 'rounded-md p-1 text-center leading-tight transition-all duration-500 landing-table-cell';
  if (isActive) return `${base} landing-table-active ring-2 ring-orange-400 ring-offset-1 ring-offset-slate-900 scale-[1.06] z-10`;
  switch (status) {
    case 'occupied':
      return `${base} bg-gradient-to-br from-orange-500 to-orange-600 text-white shadow-sm`;
    case 'paying':
      return `${base} bg-gradient-to-br from-red-800 to-red-700 text-white shadow-sm landing-table-paying`;
    case 'reserved':
      return `${base} border border-dashed border-slate-500 text-slate-400 bg-slate-800/60`;
    default:
      return `${base} bg-slate-700/90 text-slate-400`;
  }
}

/** Hero slider: canlı masa salonu mockup */
export function HeroDashboard() {
  const occupiedIds = useMemo(
    () => TABLES.filter((t) => t.status === 'occupied' || t.status === 'paying').map((t) => t.id),
    [],
  );
  const [activeTable, setActiveTable] = useState(occupiedIds[0] ?? 2);
  const [revenue, setRevenue] = useState(5840);
  const [orderIndex, setOrderIndex] = useState(0);

  useEffect(() => {
    if (occupiedIds.length === 0) return;
    let i = 0;
    const t = window.setInterval(() => {
      i = (i + 1) % occupiedIds.length;
      setActiveTable(occupiedIds[i]);
    }, 2200);
    return () => window.clearInterval(t);
  }, [occupiedIds]);

  useEffect(() => {
    const t = window.setInterval(() => {
      setRevenue((v) => v + Math.floor(Math.random() * 40) + 5);
    }, 3200);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    const t = window.setInterval(() => {
      setOrderIndex((i) => (i + 1) % ONLINE_ORDERS.length);
    }, 2800);
    return () => window.clearInterval(t);
  }, []);

  const openTables = TABLES.filter((t) => t.status !== 'empty').length;
  const totalGuests = TABLES.reduce((s, t) => s + (t.guests ?? 0), 0);

  return (
    <div className="h-full flex flex-col bg-black text-white text-[10px] rounded-lg overflow-hidden landing-hero-dashboard">
      <div className="bg-gradient-to-r from-orange-600 via-orange-500 to-red-800 px-3 py-2 flex justify-between items-center gap-2 shrink-0">
        <div>
          <p className="font-bold text-[11px] text-white leading-tight">Salon ekranı</p>
          <p className="text-[8px] text-orange-100/85">Masa · Online · Paket</p>
        </div>
        <div className="text-right">
          <p className="text-[9px] text-orange-100/90 uppercase tracking-wider font-semibold">Günlük ciro</p>
          <p key={revenue} className="font-black text-sm tabular-nums landing-revenue-tick">₺{revenue.toLocaleString('tr-TR')}</p>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-[1.15fr_0.9fr_0.85fr] min-h-0 min-h-[180px]">
        {/* Masalar — dolu salon */}
        <div className="p-2 border-r border-slate-800 bg-slate-950 flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-1.5 shrink-0">
            <p className="text-orange-500 font-bold text-[9px] uppercase tracking-wide">Salon · Masalar</p>
            <span className="text-[8px] text-slate-500">{openTables}/12 dolu</span>
          </div>
          <div className="grid grid-cols-4 gap-1 flex-1 content-start">
            {TABLES.map((t) => (
              <div key={t.id} className={tableClass(t.status, activeTable === t.id)}>
                <p className="font-bold">M{t.id}</p>
                {t.amount != null && (
                  <p className="text-[8px] opacity-95 font-semibold">₺{t.amount}</p>
                )}
                {t.guests != null && t.status !== 'empty' && (
                  <p className="text-[7px] opacity-80">{t.guests} kişi</p>
                )}
                {t.status === 'reserved' && <p className="text-[7px]">Rezerve</p>}
                {t.status === 'paying' && <p className="text-[7px] font-bold">Ödeme</p>}
              </div>
            ))}
          </div>
          <div className="mt-1.5 pt-1 border-t border-slate-800 flex justify-between text-[8px] text-slate-500 shrink-0">
            <span>{totalGuests} misafir</span>
            <span className="text-orange-400 animate-pulse">● Canlı</span>
          </div>
        </div>

        {/* Online */}
        <div className="p-2 border-r border-slate-800 bg-slate-900/90 flex flex-col">
          <p className="text-red-400 font-bold text-[9px] uppercase tracking-wide mb-1.5">Online</p>
          <div className="space-y-1 flex-1">
            {ONLINE_ORDERS.map((o, idx) => (
              <div
                key={o.id}
                className={`bg-slate-800 rounded px-1.5 py-1 border-l-2 ${o.color} landing-order-slide ${
                  idx === orderIndex ? 'landing-order-highlight' : 'opacity-70'
                }`}
                style={{ animationDelay: `${idx * 0.15}s` }}
              >
                <p className="font-bold text-[9px]">{o.platform}</p>
                <p className="text-[8px] text-slate-400">#{o.id}</p>
              </div>
            ))}
          </div>
          <div className="mt-1 bg-red-950/50 border border-red-800/60 rounded px-1.5 py-1 text-[8px] text-red-200 landing-order-slide">
            +1 yeni sipariş
          </div>
        </div>

        {/* Paket */}
        <div className="p-2 bg-slate-900 flex flex-col">
          <p className="text-orange-500 font-bold text-[9px] uppercase tracking-wide mb-1.5">Paket</p>
          <div className="bg-emerald-950/80 border border-emerald-600/70 rounded px-1.5 py-1.5 mb-1 landing-caller-pulse">
            <p className="text-emerald-300 font-bold text-[9px]">Caller ID</p>
            <p className="text-[8px] text-emerald-100/80">0532 ••• 48 21</p>
          </div>
          <div className="space-y-1 flex-1">
            <div className="bg-slate-800 rounded px-1.5 py-1 text-[8px]">Paket #104 · ₺186</div>
            <div className="bg-slate-800 rounded px-1.5 py-1 text-[8px]">Paket #105 · ₺92</div>
            <div className="bg-orange-900/40 border border-orange-600/50 rounded px-1.5 py-1 text-[8px] text-orange-200">
              3 aktif sipariş
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
