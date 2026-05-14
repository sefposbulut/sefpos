import { useState, useEffect } from 'react';
import { BarChart3, Package, Building2, Users } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { REPORTS_INITIAL_TAB_STORAGE_KEY, REPORTS_MENU_LAST_KEY } from '../../lib/reportsNav';
import { SalesReport } from './SalesReport';
import { ProductReport } from './ProductReport';
import { BranchReport } from './BranchReport';
import { StaffReport } from './StaffReport';

type ReportTab = 'sales' | 'products' | 'branches' | 'staff';

interface Branch {
  id: string;
  name: string;
  is_main: boolean;
}

export function Reports() {
  const { tenant, isOwnerOrAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState<ReportTab>('sales');
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>('all');

  useEffect(() => {
    if (!tenant) return;
    (async () => {
      const { data } = await supabase
        .from('branches')
        .select('id, name, is_main')
        .eq('tenant_id', tenant.id)
        .eq('is_active', true)
        .order('is_main', { ascending: false })
        .order('name');
      if (data) setBranches(data as Branch[]);
    })();
  }, [tenant]);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(REPORTS_INITIAL_TAB_STORAGE_KEY);
      if (raw === 'sales' || raw === 'products' || raw === 'branches' || raw === 'staff') {
        if (raw === 'branches' && !isOwnerOrAdmin) {
          sessionStorage.removeItem(REPORTS_INITIAL_TAB_STORAGE_KEY);
          return;
        }
        setActiveTab(raw);
      }
      sessionStorage.removeItem(REPORTS_INITIAL_TAB_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, [isOwnerOrAdmin]);

  useEffect(() => {
    try {
      sessionStorage.setItem(REPORTS_MENU_LAST_KEY, activeTab === 'sales' ? 'sales' : 'genel');
    } catch {
      /* ignore */
    }
  }, [activeTab]);

  const tabs: { key: ReportTab; label: string; icon: typeof BarChart3; ownerOnly?: boolean }[] = [
    { key: 'sales', label: 'Satış Raporu', icon: BarChart3 },
    { key: 'products', label: 'Ürün Raporu', icon: Package },
    { key: 'branches', label: 'Şube Raporu', icon: Building2, ownerOnly: true },
    { key: 'staff', label: 'Personel Raporu', icon: Users },
  ];

  const visibleTabs = tabs.filter((t) => !t.ownerOnly || isOwnerOrAdmin);

  return (
    <div className="fixed inset-0 top-14 md:top-20 bg-gradient-to-br from-slate-50 to-slate-100 overflow-auto">
      <div className="p-4 md:p-6 max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900">Raporlar</h1>
          <p className="text-sm text-slate-500 mt-1">
            Satış, ürün, şube ve personel performans raporları. Ürün sayımı geçmişi için menüden{' '}
            <strong className="text-slate-700">Raporlar → Sayım raporu</strong>.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 mb-6">
          <div className="flex flex-wrap gap-2 bg-white rounded-xl p-1 shadow-sm border border-slate-200">
            {visibleTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {isOwnerOrAdmin && activeTab !== 'branches' && branches.length > 1 && (
            <select
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              className="ml-auto px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">Tüm Şubeler</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          {activeTab === 'sales' && <SalesReport selectedBranch={selectedBranch} />}
          {activeTab === 'products' && <ProductReport selectedBranch={selectedBranch} />}
          {activeTab === 'branches' && isOwnerOrAdmin && <BranchReport />}
          {activeTab === 'staff' && <StaffReport selectedBranch={selectedBranch} />}
        </div>
      </div>
    </div>
  );
}
