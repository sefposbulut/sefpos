import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Gift, Loader2, Phone, Search, Sparkles, UserPlus, X } from 'lucide-react';
import {
  createCustomerQuick,
  searchCustomersForLoyalty,
  type CustomerListRow,
} from '../../lib/customersApi';
import { supabase } from '../../lib/supabase';
import {
  calcEarnPointsPreview,
  calcLoyaltyDiscountTl,
  calcMaxRedeemPoints,
  fetchLoyaltySettings,
  type LoyaltySettings,
} from '../../lib/loyalty';

import type { LoyaltyPaymentSelection } from '../../lib/loyalty';

export type { LoyaltyPaymentSelection };

type CustomerRow = {
  id: string;
  name: string;
  phone: string | null;
  loyalty_points: number;
};

type Props = {
  tenantId: string;
  billTotalTl: number;
  value: LoyaltyPaymentSelection | null;
  onChange: (v: LoyaltyPaymentSelection | null) => void;
};

const MIN_SEARCH = 2;

function toRow(c: CustomerListRow): CustomerRow {
  return {
    id: c.id,
    name: c.name,
    phone: c.phone,
    loyalty_points: c.loyalty_points ?? 0,
  };
}

export function LoyaltyPaymentSection({ tenantId, billTotalTl, value, onChange }: Props) {
  const [settings, setSettings] = useState<LoyaltySettings | null>(null);
  const [search, setSearch] = useState('');
  const [hits, setHits] = useState<CustomerRow[]>([]);
  const [selectedRow, setSelectedRow] = useState<CustomerRow | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(!!value);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickName, setQuickName] = useState('');
  const [quickPhone, setQuickPhone] = useState('');
  const [quickSaving, setQuickSaving] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void fetchLoyaltySettings(tenantId).then(setSettings);
  }, [tenantId]);

  const loadSelectedPoints = useCallback(async (customerId: string) => {
    const cols = 'id, name, phone, loyalty_points';
    let res = await supabase.from('customers').select(cols).eq('id', customerId).maybeSingle();
    if (res.error && /loyalty_points/i.test(res.error.message || '')) {
      res = await supabase.from('customers').select('id, name, phone').eq('id', customerId).maybeSingle();
    }
    if (res.data) {
      const d = res.data as { id: string; name: string; phone: string | null; loyalty_points?: number };
      setSelectedRow({
        id: d.id,
        name: d.name,
        phone: d.phone,
        loyalty_points: d.loyalty_points ?? 0,
      });
    }
  }, []);

  useEffect(() => {
    if (value?.customerId) {
      void loadSelectedPoints(value.customerId);
    } else {
      setSelectedRow(null);
    }
  }, [value?.customerId, loadSelectedPoints]);

  const runSearch = useCallback(
    async (q: string) => {
      const trimmed = q.trim();
      if (trimmed.length < MIN_SEARCH) {
        setHits([]);
        setSearchErr(null);
        setSearching(false);
        return;
      }
      setSearching(true);
      setSearchErr(null);
      const { data, error } = await searchCustomersForLoyalty(tenantId, trimmed, 8);
      setSearching(false);
      if (error) {
        setSearchErr(error.message);
        setHits([]);
        return;
      }
      setHits(data.map(toRow));
    },
    [tenantId],
  );

  useEffect(() => {
    if (!expanded || value) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void runSearch(search);
    }, 280);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search, expanded, value, runSearch]);

  const selected = selectedRow;

  const maxRedeem = useMemo(() => {
    if (!settings?.enabled || !value) return 0;
    return calcMaxRedeemPoints(selected?.loyalty_points ?? 0, billTotalTl, settings);
  }, [settings, value, selected, billTotalTl]);

  const earnPreview = useMemo(() => {
    if (!settings?.enabled || !value) return 0;
    return calcEarnPointsPreview(billTotalTl, value.discountTl, settings);
  }, [settings, value, billTotalTl]);

  if (!settings?.enabled) return null;

  const applyCustomer = (c: CustomerRow) => {
    setSelectedRow(c);
    onChange({
      customerId: c.id,
      customerName: c.name,
      redeemPoints: 0,
      discountTl: 0,
    });
    setExpanded(false);
    setSearch('');
    setHits([]);
    setShowQuickAdd(false);
  };

  const useMaxPoints = () => {
    if (!value || !settings) return;
    const pts = calcMaxRedeemPoints(selected?.loyalty_points ?? 0, billTotalTl, settings);
    const discountTl = calcLoyaltyDiscountTl(pts, settings.redeem_tl_per_point);
    onChange({
      ...value,
      redeemPoints: pts,
      discountTl,
    });
  };

  const clearLoyalty = () => {
    onChange(null);
    setSelectedRow(null);
    setSearch('');
    setHits([]);
    setShowQuickAdd(false);
    setExpanded(true);
  };

  const handleQuickAdd = async () => {
    const name = quickName.trim();
    const phone = quickPhone.trim();
    if (!name && !phone) return;
    setQuickSaving(true);
    const { data, error } = await createCustomerQuick(tenantId, {
      name: name || `Müşteri ${phone}`,
      phone: phone || null,
    });
    setQuickSaving(false);
    if (error || !data) {
      setSearchErr(error?.message || 'Kayıt oluşturulamadı');
      return;
    }
    applyCustomer(toRow(data));
    setQuickName('');
    setQuickPhone('');
  };

  const canSearch = search.trim().length >= MIN_SEARCH;

  return (
    <div className="rounded-xl border-2 border-violet-200 bg-gradient-to-br from-violet-50 to-white p-2.5 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-violet-800 min-w-0">
          <Gift className="w-4 h-4 shrink-0" />
          <span className="text-sm font-bold truncate">Sadakat puanı</span>
        </div>
        {value ? (
          <button
            type="button"
            onClick={clearLoyalty}
            className="text-xs font-semibold text-violet-600 hover:text-violet-900 flex items-center gap-1 shrink-0"
          >
            <X className="w-3.5 h-3.5" /> Kaldır
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-xs font-bold text-violet-700 hover:underline shrink-0"
          >
            {expanded ? 'Gizle' : 'Müşteri seç'}
          </button>
        )}
      </div>

      {value && (
        <div className="bg-white rounded-lg border border-violet-100 px-2.5 py-2 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="font-bold text-slate-800 text-sm truncate">{value.customerName}</div>
              {selected?.phone && (
                <div className="text-[11px] text-slate-500 flex items-center gap-1">
                  <Phone className="w-3 h-3" />
                  {selected.phone}
                </div>
              )}
              <div className="text-xs text-violet-700 font-semibold">
                Bakiye: {(selected?.loyalty_points ?? 0).toLocaleString('tr-TR')} puan
              </div>
            </div>
            {maxRedeem > 0 && (
              <button
                type="button"
                onClick={useMaxPoints}
                className="px-2 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-[11px] font-bold whitespace-nowrap shrink-0"
              >
                Puan kullan ({maxRedeem})
              </button>
            )}
          </div>
          {value.redeemPoints > 0 && (
            <div className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-2 py-1">
              −{value.discountTl.toFixed(2)} ₺ ({value.redeemPoints} puan)
            </div>
          )}
          {earnPreview > 0 && (
            <div className="text-[11px] text-slate-600 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-amber-500 shrink-0" />
              Bu ödemede yaklaşık <strong>+{earnPreview}</strong> puan
            </div>
          )}
        </div>
      )}

      {expanded && !value && (
        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="İsim veya telefon (min. 2 karakter)"
              className="w-full pl-9 pr-3 py-2 border border-violet-200 rounded-lg text-sm bg-white"
              autoFocus
            />
          </div>

          {!canSearch && (
            <p className="text-[11px] text-slate-500 text-center py-1">
              Tüm müşteriler listelenmez — arayın veya yeni cari ekleyin
            </p>
          )}

          {canSearch && searching && (
            <p className="text-xs text-slate-500 text-center py-1 flex items-center justify-center gap-1">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Aranıyor…
            </p>
          )}

          {canSearch && !searching && searchErr && (
            <p className="text-xs text-red-600 text-center py-1">{searchErr}</p>
          )}

          {canSearch && !searching && !searchErr && hits.length > 0 && (
            <ul className="max-h-28 overflow-y-auto space-y-0.5 rounded-lg border border-violet-100 bg-white">
              {hits.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => applyCustomer(c)}
                    className="w-full flex items-center justify-between gap-2 px-2.5 py-2 hover:bg-violet-50 text-left"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-800 truncate">{c.name}</div>
                      {c.phone && (
                        <div className="text-[10px] text-slate-500 truncate">{c.phone}</div>
                      )}
                    </div>
                    <span className="text-[11px] font-bold text-violet-700 shrink-0">
                      {c.loyalty_points} p
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {canSearch && !searching && !searchErr && hits.length === 0 && (
            <p className="text-xs text-slate-500 text-center py-1">Eşleşen cari yok</p>
          )}

          {!showQuickAdd ? (
            <button
              type="button"
              onClick={() => {
                setShowQuickAdd(true);
                if (search.trim() && /^\d/.test(search.replace(/\s/g, ''))) {
                  setQuickPhone(search.trim());
                } else if (search.trim()) {
                  setQuickName(search.trim());
                }
              }}
              className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed border-violet-300 text-violet-800 text-xs font-bold hover:bg-violet-50"
            >
              <UserPlus className="w-4 h-4" />
              Yeni cari ekle
            </button>
          ) : (
            <div className="rounded-lg border border-violet-200 bg-white p-2.5 space-y-2">
              <div className="text-xs font-bold text-violet-800">Hızlı cari kartı</div>
              <input
                value={quickName}
                onChange={(e) => setQuickName(e.target.value)}
                placeholder="Ad soyad"
                className="w-full px-2.5 py-2 border rounded-lg text-sm"
              />
              <input
                value={quickPhone}
                onChange={(e) => setQuickPhone(e.target.value)}
                placeholder="Telefon"
                inputMode="tel"
                className="w-full px-2.5 py-2 border rounded-lg text-sm"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowQuickAdd(false)}
                  className="flex-1 py-2 text-xs font-semibold text-slate-600 bg-slate-100 rounded-lg"
                >
                  İptal
                </button>
                <button
                  type="button"
                  onClick={() => void handleQuickAdd()}
                  disabled={quickSaving || (!quickName.trim() && !quickPhone.trim())}
                  className="flex-1 py-2 text-xs font-bold text-white bg-violet-600 rounded-lg disabled:opacity-50"
                >
                  {quickSaving ? 'Kaydediliyor…' : 'Kaydet ve seç'}
                </button>
              </div>
            </div>
          )}

          <p className="text-[10px] text-slate-500 leading-snug">
            <strong>Cari borçtan ayrıdır:</strong> burada seçilen müşteriye yalnızca puan yazılır;
            veresiye (açık hesap) ödemesi cari bakiyesini etkiler. Oranlar:{' '}
            <strong>Ayarlar → Sadakat</strong>.
          </p>
        </div>
      )}
    </div>
  );
}
