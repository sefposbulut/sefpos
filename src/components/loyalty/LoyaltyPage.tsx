import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Gift, Users } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { fetchCustomersList } from '../../lib/customersApi';
import { useAuth } from '../../contexts/AuthContext';
import { LoyaltySettingsPanel } from './LoyaltySettingsPanel';

type TxRow = {
  id: string;
  type: string;
  points_delta: number;
  tl_amount: number | null;
  created_at: string;
  customer?: { name: string } | null;
};

type Props = {
  onBack?: () => void;
};

export function LoyaltyPage({ onBack }: Props) {
  const { tenant } = useAuth();
  const [txs, setTxs] = useState<TxRow[]>([]);
  const [topCustomers, setTopCustomers] = useState<
    { id: string; name: string; phone: string | null; loyalty_points: number }[]
  >([]);

  const load = useCallback(async () => {
    if (!tenant?.id) return;

    const { data: txData } = await supabase
      .from('loyalty_transactions')
      .select('id, type, points_delta, tl_amount, created_at, customer:customers(name)')
      .eq('tenant_id', tenant.id)
      .order('created_at', { ascending: false })
      .limit(25);
    setTxs((txData || []) as TxRow[]);

    const { data: custData } = await fetchCustomersList(tenant.id);
    const top = [...custData]
      .sort((a, b) => (b.loyalty_points ?? 0) - (a.loyalty_points ?? 0))
      .slice(0, 10)
      .map((c) => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        loyalty_points: c.loyalty_points ?? 0,
      }));
    setTopCustomers(top);
  }, [tenant?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!tenant) return null;

  return (
    <div className="h-full flex flex-col bg-gradient-to-br from-slate-50 to-violet-50/30">
      <div className="bg-gradient-to-r from-violet-600 to-purple-700 text-white px-4 md:px-6 py-4 flex items-center gap-3 shrink-0">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="p-2 rounded-lg hover:bg-white/10"
            aria-label="Geri"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}
        <Gift className="w-7 h-7" />
        <div>
          <h1 className="text-xl font-black">Sadakat</h1>
          <p className="text-violet-100 text-sm">Otomatik puan — ödeme ekranından kullanılır</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6 max-w-3xl mx-auto w-full space-y-5">
        <LoyaltySettingsPanel tenantId={tenant.id} />

        <section className="bg-white rounded-2xl border border-slate-200 p-5">
          <h2 className="font-bold text-slate-800 flex items-center gap-2 mb-3">
            <Users className="w-5 h-5 text-slate-500" />
            En çok puanı olan müşteriler
          </h2>
          {topCustomers.length === 0 ? (
            <p className="text-sm text-slate-500">Henüz puan kaydı yok. Ödeme ekranından müşteri seçin.</p>
          ) : (
            <ul className="space-y-2">
              {topCustomers.map((c, i) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-slate-50"
                >
                  <span className="text-sm font-semibold text-slate-800">
                    {i + 1}. {c.name}
                    {c.phone ? (
                      <span className="text-slate-400 font-normal ml-1">{c.phone}</span>
                    ) : null}
                  </span>
                  <span className="text-sm font-black text-violet-700">{c.loyalty_points} p</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 p-5">
          <h2 className="font-bold text-slate-800 mb-3">Son hareketler</h2>
          {txs.length === 0 ? (
            <p className="text-sm text-slate-500">Henüz işlem yok.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {txs.map((t) => (
                <li key={t.id} className="flex justify-between gap-2 border-b border-slate-50 pb-2">
                  <span className="text-slate-700 truncate">
                    {(t.customer as { name?: string })?.name || 'Müşteri'} ·{' '}
                    {t.type === 'earn' ? 'Kazanım' : t.type === 'redeem' ? 'Kullanım' : t.type}
                  </span>
                  <span
                    className={`font-bold shrink-0 ${t.points_delta >= 0 ? 'text-emerald-600' : 'text-orange-600'}`}
                  >
                    {t.points_delta >= 0 ? '+' : ''}
                    {t.points_delta}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
