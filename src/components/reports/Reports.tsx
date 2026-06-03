import { useState, useEffect } from 'react';
import {
  BarChart3,
  Package,
  Building2,
  Users,
  Bike,
  LayoutDashboard,
  Globe,
  Clock,
  UserCircle,
  CalendarClock,
  ClipboardList,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import {
  REPORTS_INITIAL_TAB_STORAGE_KEY,
  REPORTS_MENU_LAST_KEY,
  REPORTS_TAB_STOCK_COUNT,
} from '../../lib/reportsNav';
import { ExecutiveSummaryReport } from './ExecutiveSummaryReport';
import { SalesReport } from './SalesReport';
import { ChannelReport } from './ChannelReport';
import { TimeReport } from './TimeReport';
import { ProductReport } from './ProductReport';
import { BranchReport } from './BranchReport';
import { StaffReport } from './StaffReport';
import { UsersReport } from './UsersReport';
import { TakeawayReport } from './TakeawayReport';
import { ShiftReport } from './ShiftReport';
import { StockCountReport } from './StockCountReport';

type ReportTab =
  | 'overview'
  | 'sales'
  | 'channels'
  | 'time'
  | 'products'
  | 'takeaway'
  | 'shifts'
  | 'users'
  | 'staff'
  | 'branches'
  | 'stock-count';

interface Branch {
  id: string;
  name: string;
  is_main: boolean;
}

const VALID_TABS: ReportTab[] = [
  'overview',
  'sales',
  'channels',
  'time',
  'products',
  'takeaway',
  'shifts',
  'users',
  'staff',
  'branches',
  REPORTS_TAB_STOCK_COUNT,
];

export function Reports({ isActive = true }: { isActive?: boolean }) {
  const { tenant, isOwnerOrAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState<ReportTab>('overview');
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>('all');

  useEffect(() => {
    if (!isActive || !tenant) return;
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
  }, [isActive, tenant]);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(REPORTS_INITIAL_TAB_STORAGE_KEY);
      if (raw && VALID_TABS.includes(raw as ReportTab)) {
        if (raw === 'branches' && !isOwnerOrAdmin) {
          sessionStorage.removeItem(REPORTS_INITIAL_TAB_STORAGE_KEY);
          return;
        }
        setActiveTab(raw as ReportTab);
      }
      sessionStorage.removeItem(REPORTS_INITIAL_TAB_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, [isOwnerOrAdmin]);

  useEffect(() => {
    try {
      sessionStorage.setItem(
        REPORTS_MENU_LAST_KEY,
        activeTab === 'sales' || activeTab === 'overview' ? 'sales' : 'genel',
      );
    } catch {
      /* ignore */
    }
  }, [activeTab]);

  const tabs: {
    key: ReportTab;
    label: string;
    icon: typeof BarChart3;
    ownerOnly?: boolean;
  }[] = [
    { key: 'overview', label: 'Özet', icon: LayoutDashboard },
    { key: 'sales', label: 'Satış', icon: BarChart3 },
    { key: 'channels', label: 'Kanal', icon: Globe },
    { key: 'time', label: 'Zaman', icon: Clock },
    { key: 'products', label: 'Ürün', icon: Package },
    { key: 'takeaway', label: 'Paket', icon: Bike },
    { key: 'shifts', label: 'Vardiya', icon: CalendarClock },
    { key: 'users', label: 'Kullanıcı', icon: UserCircle },
    { key: 'staff', label: 'Garson', icon: Users },
    { key: 'branches', label: 'Şube', icon: Building2, ownerOnly: true },
    { key: REPORTS_TAB_STOCK_COUNT, label: 'Sayım', icon: ClipboardList },
  ];

  const visibleTabs = tabs.filter((t) => !t.ownerOnly || isOwnerOrAdmin);
  const showBranchFilter =
    isOwnerOrAdmin &&
    activeTab !== 'branches' &&
    activeTab !== REPORTS_TAB_STOCK_COUNT &&
    branches.length > 1;

  return (
    <div className="fixed inset-0 top-14 md:top-20 bg-gradient-to-br from-slate-50 to-slate-100 overflow-auto">
      <div className="p-4 md:p-6 max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900">Raporlar</h1>
          <p className="text-sm text-slate-500 mt-1">
            İşletme özeti, satış, kanal, zaman, ürün, paket, vardiya, kullanıcı, şube ve stok sayım
            geçmişi — tek ekranda.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 mb-6">
          <div className="flex flex-wrap gap-2 bg-white rounded-xl p-1 shadow-sm border border-slate-200 max-w-full">
            {visibleTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all whitespace-nowrap ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {showBranchFilter && (
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

        {activeTab === REPORTS_TAB_STOCK_COUNT ? (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <StockCountReport embedded />
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            {activeTab === 'overview' && (
              <ExecutiveSummaryReport selectedBranch={selectedBranch} />
            )}
            {activeTab === 'sales' && <SalesReport selectedBranch={selectedBranch} />}
            {activeTab === 'channels' && <ChannelReport selectedBranch={selectedBranch} />}
            {activeTab === 'time' && <TimeReport selectedBranch={selectedBranch} />}
            {activeTab === 'products' && <ProductReport selectedBranch={selectedBranch} />}
            {activeTab === 'takeaway' && <TakeawayReport selectedBranch={selectedBranch} />}
            {activeTab === 'shifts' && <ShiftReport selectedBranch={selectedBranch} />}
            {activeTab === 'users' && <UsersReport selectedBranch={selectedBranch} />}
            {activeTab === 'staff' && <StaffReport selectedBranch={selectedBranch} />}
            {activeTab === 'branches' && isOwnerOrAdmin && <BranchReport />}
          </div>
        )}
      </div>
    </div>
  );
}
