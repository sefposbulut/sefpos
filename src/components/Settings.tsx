import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { createClient } from '@supabase/supabase-js';
import { useAuth } from '../contexts/AuthContext';
import { Database } from '../lib/supabase';
import { X, Plus, Trash2, Settings as SettingsIcon, Building2, ToggleLeft, ToggleRight, Printer, AlertCircle, MapPin, Phone, Save, CreditCard as Edit2, User, Store, CheckCircle, Wifi, WifiOff, Globe, RefreshCw, Lock, ShieldCheck, Eye, EyeOff, Package, CheckSquare, Square, Database as DatabaseIcon, Receipt, Pencil, Scale, Loader, QrCode, PhoneIncoming, FlaskConical, Clock } from 'lucide-react';
import {
  isCallerIdAvailable,
  startCallerId,
  stopCallerId,
  callerIdStatus,
  onCallerIdSignal,
  onCallerIdError,
  simulateRing,
  callerIdLocalSettings,
  type CallerIdStatus,
} from '../lib/callerId';
import { HuginSettings, loadHuginSettings, saveHuginSettings, testHuginConnection } from '../lib/huginTps';
import { Branch } from '../contexts/AuthContext';
import { PrinterSettings } from './PrinterSettings';
import { SqlServerSettings } from './SqlServerSettings';
import { DeviceManagement } from './DeviceManagement';
import { WaiterManagement } from './WaiterManagement';
import { ScaleCalibration } from './ScaleCalibration';
import { QrMenuManager } from './QrMenuManager';

type TableGroup = Database['public']['Tables']['table_groups']['Row'];

interface SettingsProps {
  onClose: () => void;
}

export function Settings({ onClose }: SettingsProps) {
  const { tenant, profile, activeBranch, refreshProfile, refreshBranches } = useAuth();
  const [activeTab, setActiveTab] = useState<'tables' | 'products' | 'manage' | 'platforms' | 'branches' | 'printers' | 'account' | 'system' | 'security' | 'branch-products' | 'database' | 'hugin' | 'devices' | 'waiters' | 'scale' | 'qr-menu' | 'caller-id'>('branches');
  const [groups, setGroups] = useState<TableGroup[]>([]);
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupPrefix, setGroupPrefix] = useState('');
  const [groupColor, setGroupColor] = useState('#FF6B35');
  const [tableCount, setTableCount] = useState('10');
  const [tableCapacity, setTableCapacity] = useState('4');
  const [tableBranchId, setTableBranchId] = useState<string>('');
  const [groupBranchId, setGroupBranchId] = useState<string>('');
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [tables, setTables] = useState<any[]>([]);
  const [globalTableSize, setGlobalTableSize] = useState<string>('medium');
  const [selectedTables, setSelectedTables] = useState<Set<string>>(new Set());
  const [bulkSelectMode, setBulkSelectMode] = useState(false);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [showBranchForm, setShowBranchForm] = useState(false);
  const [branchName, setBranchName] = useState('');
  const [branchAddress, setBranchAddress] = useState('');
  const [branchPhone, setBranchPhone] = useState('');
  const [editingBranch, setEditingBranch] = useState<string | null>(null);
  const [editBranchName, setEditBranchName] = useState('');
  const [editBranchAddress, setEditBranchAddress] = useState('');
  const [editBranchPhone, setEditBranchPhone] = useState('');
  const [requireCancelReason, setRequireCancelReason] = useState(false);
  const [platforms, setPlatforms] = useState<any[]>([]);
  const [showPlatformForm, setShowPlatformForm] = useState(false);
  const [platformName, setPlatformName] = useState('');
  const [platformCode, setPlatformCode] = useState('');
  const [platformUsername, setPlatformUsername] = useState('');
  const [platformPassword, setPlatformPassword] = useState('');
  const [platformApiKey, setPlatformApiKey] = useState('');
  const [platformAppSecretKey, setPlatformAppSecretKey] = useState('');
  const [platformRestaurantSecretKey, setPlatformRestaurantSecretKey] = useState('');
  const [platformWebhookSecret, setPlatformWebhookSecret] = useState('');
  const [platformCommission, setPlatformCommission] = useState('15');
  const [platformChainCode, setPlatformChainCode] = useState('');
  const [platformRemoteCode, setPlatformRemoteCode] = useState('');
  const [platformRestaurantId, setPlatformRestaurantId] = useState('');
  const [platformMiddlewareUrl, setPlatformMiddlewareUrl] = useState('');
  const [editingPlatformId, setEditingPlatformId] = useState<string | null>(null);
  const selectedPlatformCode = platformCode.toLowerCase();
  const isGetirPlatform = selectedPlatformCode === 'getir';
  const isYemeksepetiPlatform = selectedPlatformCode === 'yemeksepeti';

  const [restaurantName, setRestaurantName] = useState('');
  const [restaurantAddress, setRestaurantAddress] = useState('');
  const [restaurantPhone, setRestaurantPhone] = useState('');
  const [profileFullName, setProfileFullName] = useState('');
  const [accountSaving, setAccountSaving] = useState(false);
  const [accountSaved, setAccountSaved] = useState(false);
  const [deploymentMode, setDeploymentMode] = useState<'online' | 'hybrid' | 'offline'>('online');
  const [deploymentSaving, setDeploymentSaving] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  const [pinValue, setPinValue] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [pinSaving, setPinSaving] = useState(false);
  const [pinSaved, setPinSaved] = useState(false);
  const [pinError, setPinError] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [currentPin, setCurrentPin] = useState('');
  const [pinLoaded, setPinLoaded] = useState(false);
  const [inventoryResetPin, setInventoryResetPin] = useState('');
  const [inventoryResetBranchId, setInventoryResetBranchId] = useState('');
  const [inventoryResetLoading, setInventoryResetLoading] = useState(false);
  const [inventoryResetMessage, setInventoryResetMessage] = useState('');

  const [branchProductSync, setBranchProductSync] = useState<Record<string, boolean>>({});
  const [branchSyncSaving, setBranchSyncSaving] = useState(false);

  const [dbUrl, setDbUrl] = useState(() => localStorage.getItem('shefpos_db_url') || import.meta.env.VITE_SUPABASE_URL || '');
  const [dbAnonKey, setDbAnonKey] = useState(() => localStorage.getItem('shefpos_db_anon_key') || import.meta.env.VITE_SUPABASE_ANON_KEY || '');
  const [showDbKey, setShowDbKey] = useState(false);
  const [dbSaving, setDbSaving] = useState(false);
  const [dbSaved, setDbSaved] = useState(false);
  const [dbError, setDbError] = useState('');

  const [huginSettings, setHuginSettings] = useState<HuginSettings>(() => loadHuginSettings());
  const [huginSaving, setHuginSaving] = useState(false);
  const [huginSaved, setHuginSaved] = useState(false);
  const [huginTestResult, setHuginTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [huginTesting, setHuginTesting] = useState(false);
  const [huginCategories, setHuginCategories] = useState<Array<{ id: string; name: string; vat_rate: number | null; hugin_department_id: number | null }>>([]);
  const [huginCategorySaving, setHuginCategorySaving] = useState<string | null>(null);

  // ===== Caller ID =====
  const cidAvailable = isCallerIdAvailable();
  const [cidSettings, setCidSettings] = useState(() => callerIdLocalSettings.load());
  const [cidStatusInfo, setCidStatusInfo] = useState<CallerIdStatus>({ available: cidAvailable, running: false });
  const [cidBusy, setCidBusy] = useState(false);
  const [cidError, setCidError] = useState<string | null>(null);

  useEffect(() => {
    if (activeTab !== 'caller-id') return;
    let cancelled = false;
    void (async () => {
      try {
        const s = await callerIdStatus();
        if (!cancelled) setCidStatusInfo(s);
      } catch (e: any) {
        if (!cancelled) setCidError(e?.message || 'Durum alınamadı');
      }
    })();
    const offSignal = onCallerIdSignal((sig) => {
      setCidStatusInfo((prev) => ({
        ...prev,
        connected: sig.connected,
        deviceModel: sig.deviceModel,
        deviceSerial: sig.deviceSerial,
        running: true,
      }));
    });
    const offError = onCallerIdError(({ message }) => setCidError(message));
    return () => {
      cancelled = true;
      offSignal();
      offError();
    };
  }, [activeTab]);

  const cidSaveAndApply = async (next: { autoStart: boolean; softTest: boolean; enabled: boolean }) => {
    setCidBusy(true);
    setCidError(null);
    try {
      callerIdLocalSettings.save({ autoStart: next.autoStart, softTest: next.softTest });
      setCidSettings({ autoStart: next.autoStart, softTest: next.softTest });
      if (!next.enabled) {
        await stopCallerId();
        const s = await callerIdStatus();
        setCidStatusInfo(s);
        return;
      }
      const s = await startCallerId({ softTest: next.softTest });
      setCidStatusInfo(s);
    } catch (e: any) {
      setCidError(e?.message || 'Caller ID değişikliği uygulanamadı');
    } finally {
      setCidBusy(false);
    }
  };

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => { window.removeEventListener('online', handleOnline); window.removeEventListener('offline', handleOffline); };
  }, []);

  useEffect(() => {
    if (tenant) {
      setRestaurantName((tenant as any).name || '');
      setRestaurantAddress((tenant as any).address || '');
      setRestaurantPhone((tenant as any).phone || '');
      setDeploymentMode((tenant as any).deployment_mode || 'online');
      supabase.from('tenants').select('lock_pin').eq('id', tenant.id).maybeSingle().then(({ data }) => {
        setCurrentPin((data as any)?.lock_pin || '');
        setPinLoaded(true);
      });
    }
    if (profile) {
      setProfileFullName((profile as any).full_name || '');
    }
  }, [tenant?.id, profile?.id]);

  useEffect(() => {
    if (!tenant || activeTab !== 'hugin') return;
    supabase
      .from('categories')
      .select('id, name, vat_rate, hugin_department_id')
      .eq('tenant_id', tenant.id)
      .order('name')
      .then(({ data }) => {
        if (data) setHuginCategories(data as any);
      });
  }, [tenant?.id, activeTab]);

  const handleSavePin = async () => {
    if (!tenant) return;
    if (pinValue && pinValue.length < 4) { setPinError('PIN en az 4 haneli olmalıdır'); return; }
    if (pinValue && pinValue !== pinConfirm) { setPinError('PIN kodları eşleşmiyor'); return; }
    setPinError('');
    setPinSaving(true);
    await supabase.from('tenants').update({ lock_pin: pinValue || null } as any).eq('id', tenant.id);
    setCurrentPin(pinValue);
    setPinValue('');
    setPinConfirm('');
    await refreshProfile?.();
    setPinSaving(false);
    setPinSaved(true);
    setTimeout(() => setPinSaved(false), 2500);
  };

  const loadBranchProductSync = async () => {
    if (!tenant) return;
    const { data } = await supabase
      .from('branches')
      .select('id, name, is_main, use_central_products')
      .eq('tenant_id', tenant.id)
      .order('is_main', { ascending: false });
    if (data) {
      const syncMap: Record<string, boolean> = {};
      (data as any[]).forEach(b => { syncMap[b.id] = b.use_central_products !== false; });
      setBranchProductSync(syncMap);
      setBranches(data as Branch[]);
    }
  };

  const handleToggleBranchSync = async (branchId: string, val: boolean) => {
    setBranchProductSync(prev => ({ ...prev, [branchId]: val }));
    await supabase.from('branches').update({ use_central_products: val } as any).eq('id', branchId);
  };

  const handleResetBranchInventory = async () => {
    if (!tenant) return;
    const isCenterUser = !!activeBranch?.is_main && profile?.role === 'owner';
    if (!isCenterUser) {
      setInventoryResetMessage('Bu islem yalnizca merkez kullanici (ana sube owner) tarafindan yapilabilir.');
      return;
    }
    if (!inventoryResetBranchId) {
      setInventoryResetMessage('Lutfen sifirlanacak subeyi secin.');
      return;
    }
    if (!currentPin) {
      setInventoryResetMessage('Once Guvenlik ekranindan PIN tanimlayin.');
      return;
    }
    if (inventoryResetPin !== currentPin) {
      setInventoryResetMessage('PIN kodu hatali.');
      return;
    }

    setInventoryResetLoading(true);
    setInventoryResetMessage('');
    const resetNote = `Sube envanteri sifirlama (${new Date().toLocaleString('tr-TR')})`;

    const { data: rows, error: readErr } = await supabase
      .from('branch_product_stocks')
      .select('product_id, quantity')
      .eq('tenant_id', tenant.id)
      .eq('branch_id', inventoryResetBranchId)
      .gt('quantity', 0);

    if (readErr) {
      setInventoryResetLoading(false);
      setInventoryResetMessage('Sube stok tablosu okunamadi: ' + readErr.message);
      return;
    }

    for (const row of (rows || [])) {
      const qty = Number((row as any).quantity || 0);
      if (qty <= 0) continue;
      await supabase.from('stock_movements').insert({
        tenant_id: tenant.id,
        product_id: (row as any).product_id,
        movement_type: 'adjustment',
        quantity: qty,
        source_branch_id: inventoryResetBranchId,
        reference_type: 'inventory_reset',
        note: resetNote,
      } as any);
    }

    const { error: zeroErr } = await supabase
      .from('branch_product_stocks')
      .update({ quantity: 0 } as any)
      .eq('tenant_id', tenant.id)
      .eq('branch_id', inventoryResetBranchId);

    setInventoryResetLoading(false);
    if (zeroErr) {
      setInventoryResetMessage('Sifirlama basarisiz: ' + zeroErr.message);
      return;
    }

    setInventoryResetPin('');
    setInventoryResetMessage('Sube stogu basariyla sifirlandi.');
  };

  const handleSaveAccount = async () => {
    if (!tenant) return;
    setAccountSaving(true);
    await Promise.all([
      supabase.from('tenants').update({
        name: restaurantName,
        address: restaurantAddress,
        phone: restaurantPhone,
      } as any).eq('id', tenant.id),
      profile ? supabase.from('profiles').update({ full_name: profileFullName } as any).eq('id', profile.id) : Promise.resolve(),
    ]);
    await refreshProfile?.();
    setAccountSaving(false);
    setAccountSaved(true);
    setTimeout(() => setAccountSaved(false), 2500);
  };

  const handleSaveDeploymentMode = async () => {
    if (!tenant) return;
    setDeploymentSaving(true);
    await supabase.from('tenants').update({ deployment_mode: deploymentMode } as any).eq('id', tenant.id);
    setDeploymentSaving(false);
  };

  useEffect(() => {
    if (tenant) {
      loadGroups();
      if (activeTab === 'manage') {
        loadTables();
      }
      if (activeTab === 'platforms') {
        loadPlatforms();
      }
      if (activeTab === 'branches') {
        loadBranches();
      }
      if (activeTab === 'branch-products') {
        loadBranchProductSync();
      }
    }
  }, [tenant, activeTab, activeBranch]);

  useEffect(() => {
    if (tenant?.id) {
      supabase.from('tenants').select('require_cancel_reason').eq('id', tenant.id).maybeSingle().then(({ data }) => {
        setRequireCancelReason(!!(data as any)?.require_cancel_reason);
      });
    }
  }, [tenant?.id]);

  const toggleRequireCancelReason = async () => {
    if (!tenant) return;
    const newValue = !requireCancelReason;
    setRequireCancelReason(newValue);
    await supabase.from('tenants').update({ require_cancel_reason: newValue } as any).eq('id', tenant.id);
  };

  const loadBranches = async () => {
    if (!tenant) return;
    const { data } = await supabase
      .from('branches')
      .select('*')
      .eq('tenant_id', tenant.id)
      .order('is_main', { ascending: false })
      .order('name');
    if (data) setBranches(data as Branch[]);
  };

  const handleCreateBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant) return;
    const { error } = await supabase.from('branches').insert({
      tenant_id: tenant.id,
      name: branchName,
      address: branchAddress,
      phone: branchPhone,
      is_main: false,
      is_active: true,
    });
    if (error) { alert('Hata: ' + error.message); return; }
    setBranchName('');
    setBranchAddress('');
    setBranchPhone('');
    setShowBranchForm(false);
    loadBranches();
    refreshBranches();
  };

  const handleUpdateBranch = async (branchId: string) => {
    const { error } = await supabase.from('branches').update({
      name: editBranchName,
      address: editBranchAddress,
      phone: editBranchPhone,
    }).eq('id', branchId);
    if (error) { alert('Hata: ' + error.message); return; }
    setEditingBranch(null);
    loadBranches();
    refreshBranches();
  };

  const handleToggleBranch = async (branchId: string, currentStatus: boolean, isMain: boolean) => {
    if (isMain) { alert('Ana şube devre dışı bırakılamaz'); return; }
    const { error } = await supabase.from('branches').update({ is_active: !currentStatus }).eq('id', branchId);
    if (!error) { loadBranches(); refreshBranches(); }
  };

  const handleDeleteBranch = async (branchId: string, isMain: boolean) => {
    if (isMain) { alert('Ana şube silinemez'); return; }
    if (!confirm('Bu şubeyi silmek istediğinizden emin misiniz?')) return;
    const { error } = await supabase.from('branches').delete().eq('id', branchId);
    if (!error) { loadBranches(); refreshBranches(); }
  };

  const loadGroups = async () => {
    if (!tenant) return;

    let query = supabase
      .from('table_groups')
      .select('id, tenant_id, name, prefix, color, branch_id, created_at')
      .eq('tenant_id', tenant.id);

    if (activeBranch) {
      query = query.or(`branch_id.eq.${activeBranch.id},branch_id.is.null`);
    }

    const { data, error } = await query.order('name');
    if (error && import.meta.env.DEV) console.error('[ŞefPOS] loadGroups:', error.message, error);

    if (data) {
      setGroups(data as any);
    }
  };

  const loadTables = async () => {
    if (!tenant) return;

    let query = supabase
      .from('restaurant_tables')
      .select('*, table_groups(name, prefix, color)')
      .eq('tenant_id', tenant.id);

    if (activeBranch) {
      query = query.eq('branch_id', activeBranch.id);
    }

    const { data } = await query.order('table_number');

    if (data) {
      const sorted = [...data].sort((a, b) =>
        String(a.table_number).localeCompare(String(b.table_number), undefined, { numeric: true, sensitivity: 'base' })
      );
      setTables(sorted);
    }
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();

    console.log('Creating group - tenant:', tenant);
    console.log('Group data:', { groupName, groupPrefix, groupColor });

    if (!tenant) {
      alert('Tenant bulunamadı. Lütfen tekrar giriş yapın.');
      return;
    }

    if (!groupName.trim()) {
      alert('Grup adı girin.');
      return;
    }

    const branchForGroup = groupBranchId || activeBranch?.id;
    if (!branchForGroup) {
      alert('Önce üst menüden bir şube seçin veya formda şube seçin.');
      return;
    }

    const rawPrefix = (groupPrefix || groupName || 'M').trim();
    const prefix = rawPrefix.slice(0, 12).toUpperCase() || 'M';

    const { data, error } = await supabase
      .from('table_groups')
      .insert({
        tenant_id: tenant.id,
        branch_id: branchForGroup,
        name: groupName.trim(),
        prefix,
        color: groupColor,
      })
      .select();

    console.log('Insert result:', { data, error });

    if (error) {
      console.error('Group creation error:', error);
      alert('Hata: ' + error.message);
      return;
    }

    alert('Grup başarıyla oluşturuldu!');
    setGroupName('');
    setGroupPrefix('');
    setGroupBranchId('');
    setShowGroupForm(false);
    loadGroups();
  };

  const handleBulkCreateTables = async () => {
    if (!tenant || !selectedGroup) {
      alert('Lütfen bir masa grubu seçin');
      return;
    }

    if (branches.length > 0 && !tableBranchId) {
      alert('Lütfen masaların ekleneceği şubeyi seçin');
      return;
    }

    const group = groups.find(g => g.id === selectedGroup);
    if (!group) return;

    const count = parseInt(tableCount);
    const capacity = parseInt(tableCapacity);

    if (isNaN(count) || count < 1 || count > 100) {
      alert('Masa sayısı 1-100 arasında olmalıdır');
      return;
    }

    const { data: existingTables } = await supabase
      .from('restaurant_tables')
      .select('table_number')
      .eq('tenant_id', tenant.id)
      .like('table_number', `${group.prefix}-%`);

    const usedNumbers = new Set(
      (existingTables || [])
        .map(t => parseInt(String(t.table_number).split('-').pop() || '0'))
        .filter(n => !isNaN(n))
    );

    const tables = [];
    let num = 1;
    while (tables.length < count) {
      if (!usedNumbers.has(num)) {
        tables.push({
          tenant_id: tenant.id,
          branch_id: tableBranchId || null,
          table_number: `${group.prefix}-${num}`,
          capacity: capacity,
          status: 'available' as const,
          group_id: group.id,
        });
      }
      num++;
    }

    const { error } = await supabase
      .from('restaurant_tables')
      .insert(tables);

    if (!error) {
      alert(`${count} masa başarıyla oluşturuldu`);
      setTableCount('10');
    } else {
      alert('Hata: ' + error.message);
    }
  };

  const handleCreateSingleTable = async () => {
    if (!tenant || !selectedGroup) {
      alert('Lütfen bir masa grubu seçin');
      return;
    }

    if (branches.length > 0 && !tableBranchId) {
      alert('Lütfen masaların ekleneceği şubeyi seçin');
      return;
    }

    const group = groups.find(g => g.id === selectedGroup);
    if (!group) return;

    const { data: existingTables } = await supabase
      .from('restaurant_tables')
      .select('table_number')
      .eq('tenant_id', tenant.id)
      .eq('group_id', group.id)
      .like('table_number', `${group.prefix}-%`);

    let nextNumber = 1;
    if (existingTables && existingTables.length > 0) {
      const numbers = existingTables
        .map(t => parseInt(t.table_number.split('-')[1]))
        .filter(n => !isNaN(n));
      nextNumber = Math.max(...numbers) + 1;
    }

    const { error } = await supabase
      .from('restaurant_tables')
      .insert({
        tenant_id: tenant.id,
        branch_id: tableBranchId || null,
        table_number: `${group.prefix}-${nextNumber}`,
        capacity: parseInt(tableCapacity),
        status: 'available',
        group_id: group.id,
      });

    if (!error) {
      alert(`Masa ${group.prefix}-${nextNumber} oluşturuldu`);
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    if (!confirm('Bu grubu silmek istediğinizden emin misiniz? Gruptaki masalar gruptan çıkarılacak.')) {
      return;
    }

    const { error } = await supabase
      .from('table_groups')
      .delete()
      .eq('id', groupId);

    if (!error) {
      loadGroups();
    }
  };

  const handleUpdateAllTablesSizes = async (newSize: string) => {
    if (!tenant) return;

    const { error } = await supabase
      .from('restaurant_tables')
      .update({ size: newSize })
      .eq('tenant_id', tenant.id);

    if (!error) {
      alert('Tüm masaların boyutu güncellendi!');
      loadTables();
    } else {
      alert('Hata: ' + error.message);
    }
  };

  const handleDeleteTable = async (tableId: string) => {
    if (!confirm('Bu masayı silmek istediğinizden emin misiniz?')) {
      return;
    }

    const { error } = await supabase
      .from('restaurant_tables')
      .delete()
      .eq('id', tableId);

    if (!error) {
      loadTables();
    }
  };

  const handleUnlockTable = async (tableId: string) => {
    try {
      const { data, error } = await supabase.rpc('unlock_table_payment', {
        p_table_id: tableId,
        p_reason: 'Admin override'
      });

      if (error) {
        alert('Hata: ' + error.message);
        return;
      }

      if (data?.success) {
        alert('Masa kilidi açıldı');
        loadTables();
      } else {
        alert('Hata: ' + (data?.error || 'Bilinmeyen hata'));
      }
    } catch (err: any) {
      alert('Hata: ' + err.message);
    }
  };

  const handleBulkDeleteTables = async () => {
    if (selectedTables.size === 0) return;
    if (!confirm(`${selectedTables.size} masayı silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.`)) return;

    const ids = Array.from(selectedTables);
    const { error } = await supabase
      .from('restaurant_tables')
      .delete()
      .in('id', ids);

    if (!error) {
      setSelectedTables(new Set());
      setBulkSelectMode(false);
      loadTables();
    } else {
      alert('Hata: ' + error.message);
    }
  };

  const toggleTableSelection = (tableId: string) => {
    setSelectedTables(prev => {
      const next = new Set(prev);
      if (next.has(tableId)) next.delete(tableId);
      else next.add(tableId);
      return next;
    });
  };

  const selectAllTables = () => {
    setSelectedTables(new Set(tables.map(t => t.id)));
  };

  const deselectAllTables = () => {
    setSelectedTables(new Set());
  };

  const loadPlatforms = async () => {
    if (!tenant) return;

    const { data } = await supabase
      .from('online_order_platforms')
      .select('*')
      .eq('tenant_id', tenant.id)
      .order('created_at', { ascending: false });

    if (data) {
      setPlatforms(data);
    }
  };

  const resetPlatformForm = () => {
    setPlatformName('');
    setPlatformCode('');
    setPlatformUsername('');
    setPlatformPassword('');
    setPlatformApiKey('');
    setPlatformAppSecretKey('');
    setPlatformRestaurantSecretKey('');
    setPlatformWebhookSecret('');
    setPlatformCommission('15');
    setPlatformChainCode('');
    setPlatformRemoteCode('');
    setPlatformRestaurantId('');
    setPlatformMiddlewareUrl('');
    setEditingPlatformId(null);
    setShowPlatformForm(false);
  };

  const handleCreatePlatform = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!tenant) {
      alert('Tenant bulunamadı.');
      return;
    }

    if (!platformCode) {
      alert('Platform kodu seçmelisiniz.');
      return;
    }

    if ((isGetirPlatform || isYemeksepetiPlatform) && !platformRestaurantId.trim()) {
      alert('Bu platform için Platform Restaurant ID zorunludur.');
      return;
    }

    if (isGetirPlatform && !platformRestaurantSecretKey.trim()) {
      alert('Getir için Restaurant Secret Key zorunludur.');
      return;
    }

    const settings = {
      username: platformUsername,
      password: platformPassword,
      api_key: platformApiKey,
      app_secret_key: platformAppSecretKey,
      restaurant_secret_key: platformRestaurantSecretKey,
      webhook_secret: platformWebhookSecret,
    };

    const platformData: any = {
      tenant_id: tenant.id,
      platform_name: platformName,
      platform_code: platformCode.toLowerCase(),
      commission_rate: parseFloat(platformCommission),
      api_key: platformApiKey,
      is_active: true,
      settings,
      middleware_chain_code: platformChainCode || null,
      middleware_vendor_code: platformRemoteCode || null,
      remote_id: platformRestaurantId || null,
      middleware_url: platformMiddlewareUrl || null,
      middleware_username: platformUsername || null,
      middleware_password: platformPassword || null,
      webhook_secret: (
        platformWebhookSecret ||
        (isGetirPlatform ? platformRestaurantSecretKey : '')
      ) || null,
    };

    let error;
    if (editingPlatformId) {
      const { error: updateError } = await supabase
        .from('online_order_platforms')
        .update(platformData)
        .eq('id', editingPlatformId);
      error = updateError;
    } else {
      const { error: insertError } = await supabase
        .from('online_order_platforms')
        .insert(platformData);
      error = insertError;
    }

    if (error) {
      alert('Hata: ' + error.message);
      return;
    }

    alert(editingPlatformId ? 'Platform güncellendi!' : 'Platform başarıyla eklendi!');
    resetPlatformForm();
    loadPlatforms();
  };

  const handleTogglePlatform = async (platformId: string, currentStatus: boolean) => {
    const { error } = await supabase
      .from('online_order_platforms')
      .update({ is_active: !currentStatus })
      .eq('id', platformId);

    if (!error) {
      loadPlatforms();
    }
  };

  const handleDeletePlatform = async (platformId: string) => {
    if (!confirm('Bu platformu silmek istediğinizden emin misiniz?')) {
      return;
    }

    const { error } = await supabase
      .from('online_order_platforms')
      .delete()
      .eq('id', platformId);

    if (!error) {
      loadPlatforms();
    }
  };

  const navItems = [
    { id: 'branches', label: 'Şubeler', icon: Building2, group: 'Yönetim' },
    { id: 'branch-products', label: 'Şube Ürünleri', icon: Package, group: 'Yönetim' },
    { id: 'qr-menu', label: 'QR Menü', icon: QrCode, group: 'Yönetim' },
    { id: 'waiters', label: 'Garsonlar', icon: User, group: 'Yönetim' },
    { id: 'tables', label: 'Masa Grupları', icon: Store, group: 'Masalar' },
    { id: 'manage', label: 'Masa Düzenle', icon: SettingsIcon, group: 'Masalar' },
    { id: 'platforms', label: 'Online Platformlar', icon: Globe, group: 'Siparişler' },
    { id: 'printers', label: 'Yazıcılar', icon: Printer, group: 'Sistem' },
    { id: 'hugin', label: 'Yazarkasa (Hugin)', icon: Receipt, group: 'Sistem' },
    { id: 'scale', label: 'Terazi Testi', icon: Scale, group: 'Sistem' },
    { id: 'caller-id', label: 'Arayan No (Caller ID)', icon: PhoneIncoming, group: 'Sistem' },
    { id: 'devices', label: 'Cihaz Yönetimi', icon: ShieldCheck, group: 'Sistem' },
    { id: 'system', label: 'Sistem Modu', icon: Wifi, group: 'Sistem' },
    { id: 'security', label: 'Güvenlik & PIN', icon: Lock, group: 'Sistem' },
    { id: 'database', label: 'Veritabanı', icon: DatabaseIcon, group: 'Sistem' },
    { id: 'account', label: 'Hesap Bilgileri', icon: User, group: 'Hesap' },
  ] as const;

  const navGroups = ['Yönetim', 'Masalar', 'Siparişler', 'Sistem', 'Hesap'];

  return (
    <div className="fixed inset-0 z-50 bg-slate-100 flex flex-col">
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white px-4 md:px-6 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-br from-orange-400 to-red-500 rounded-lg flex items-center justify-center">
            <SettingsIcon className="w-4 h-4" />
          </div>
          <h2 className="text-lg font-black">Ayarlar</h2>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg transition active:scale-95">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex flex-1 min-h-0">
        <aside className="w-52 md:w-64 bg-white border-r border-slate-200 flex-shrink-0 overflow-y-auto flex flex-col">
          <nav className="flex-1 py-3 px-2 space-y-4">
            {navGroups.map(group => {
              const items = navItems.filter(i => i.group === group);
              return (
                <div key={group}>
                  <div className="px-3 py-1 text-xs font-bold text-slate-400 uppercase tracking-wider">{group}</div>
                  {items.map(item => {
                    const Icon = item.icon;
                    const active = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => setActiveTab(item.id as any)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all active:scale-95 mt-0.5 ${
                          active
                            ? 'bg-orange-50 text-orange-700 shadow-sm border border-orange-100'
                            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'
                        }`}
                      >
                        <Icon className={`w-4 h-4 flex-shrink-0 ${active ? 'text-orange-600' : 'text-slate-400'}`} />
                        <span className="truncate">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </nav>
        </aside>

        <main className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto p-4 md:p-6">

          {activeTab === 'branches' ? (
            <div className="space-y-4">
              <div className="bg-gradient-to-r from-orange-500 to-red-600 rounded-xl p-4 md:p-6 text-white">
                <div className="flex items-center gap-3 mb-2">
                  <Building2 className="w-6 h-6" />
                  <h3 className="text-lg md:text-2xl font-bold">Şube Yönetimi</h3>
                </div>
                <p className="text-orange-50 text-sm">Restoranınızın tüm şubelerini buradan yönetebilirsiniz</p>
              </div>

              <div className="bg-gray-50 rounded-xl p-4 md:p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base md:text-lg font-bold text-gray-800">Şubeler ({branches.length})</h3>
                  <button
                    onClick={() => setShowBranchForm(!showBranchForm)}
                    className="flex items-center gap-2 bg-orange-600 hover:bg-orange-700 text-white px-3 py-2 rounded-lg transition active:scale-95 text-sm"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Yeni Şube</span>
                  </button>
                </div>

                {showBranchForm && (
                  <form onSubmit={handleCreateBranch} className="bg-white rounded-xl p-4 mb-4 space-y-3 border border-orange-200">
                    <h4 className="font-semibold text-gray-800">Yeni Şube Ekle</h4>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Şube Adı</label>
                      <input
                        type="text"
                        value={branchName}
                        onChange={(e) => setBranchName(e.target.value)}
                        placeholder="Örn: Kadıköy Şubesi"
                        className="w-full px-3 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Adres</label>
                      <input
                        type="text"
                        value={branchAddress}
                        onChange={(e) => setBranchAddress(e.target.value)}
                        placeholder="Şube adresi"
                        className="w-full px-3 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Telefon</label>
                      <input
                        type="tel"
                        value={branchPhone}
                        onChange={(e) => setBranchPhone(e.target.value)}
                        placeholder="Şube telefonu"
                        className="w-full px-3 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button type="submit" className="flex-1 bg-orange-600 hover:bg-orange-700 text-white py-2.5 rounded-lg transition font-medium">
                        Şube Oluştur
                      </button>
                      <button type="button" onClick={() => setShowBranchForm(false)} className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 py-2.5 rounded-lg transition font-medium">
                        İptal
                      </button>
                    </div>
                  </form>
                )}

                <div className="space-y-3">
                  {branches.map((branch) => (
                    <div key={branch.id} className={`bg-white rounded-xl border-2 p-4 ${branch.is_main ? 'border-orange-200' : 'border-gray-200'}`}>
                      {editingBranch === branch.id ? (
                        <div className="space-y-3">
                          <input
                            type="text"
                            value={editBranchName}
                            onChange={(e) => setEditBranchName(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:border-transparent font-semibold"
                          />
                          <input
                            type="text"
                            value={editBranchAddress}
                            onChange={(e) => setEditBranchAddress(e.target.value)}
                            placeholder="Adres"
                            className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm"
                          />
                          <input
                            type="tel"
                            value={editBranchPhone}
                            onChange={(e) => setEditBranchPhone(e.target.value)}
                            placeholder="Telefon"
                            className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm"
                          />
                          <div className="flex gap-2">
                            <button onClick={() => handleUpdateBranch(branch.id)} className="flex-1 flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg transition text-sm font-medium">
                              <Save className="w-4 h-4" /> Kaydet
                            </button>
                            <button onClick={() => setEditingBranch(null)} className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 py-2 rounded-lg transition text-sm font-medium">
                              İptal
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3 flex-1 min-w-0">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${branch.is_main ? 'bg-orange-100' : 'bg-gray-100'}`}>
                              <MapPin className={`w-5 h-5 ${branch.is_main ? 'text-orange-600' : 'text-gray-500'}`} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h4 className="font-bold text-gray-800">{branch.name}</h4>
                                {branch.is_main && (
                                  <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">Ana Şube</span>
                                )}
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${branch.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                  {branch.is_active ? 'Aktif' : 'Pasif'}
                                </span>
                              </div>
                              {branch.address && (
                                <p className="text-sm text-gray-500 mt-0.5 flex items-center gap-1">
                                  <MapPin className="w-3 h-3" /> {branch.address}
                                </p>
                              )}
                              {branch.phone && (
                                <p className="text-sm text-gray-500 flex items-center gap-1">
                                  <Phone className="w-3 h-3" /> {branch.phone}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <button
                              onClick={() => {
                                setEditingBranch(branch.id);
                                setEditBranchName(branch.name);
                                setEditBranchAddress(branch.address || '');
                                setEditBranchPhone(branch.phone || '');
                              }}
                              className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            {!branch.is_main && (
                              <>
                                <button
                                  onClick={() => handleToggleBranch(branch.id, branch.is_active, branch.is_main)}
                                  className={`p-2 rounded-lg transition ${branch.is_active ? 'text-green-600 hover:bg-green-50' : 'text-gray-400 hover:bg-gray-50'}`}
                                >
                                  {branch.is_active ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                                </button>
                                <button
                                  onClick={() => handleDeleteBranch(branch.id, branch.is_main)}
                                  className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}

                  {branches.length === 0 && (
                    <div className="text-center py-12">
                      <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                      <p className="text-gray-500">Henüz şube oluşturulmamış</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-white border-2 border-gray-200 rounded-xl p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-9 h-9 bg-orange-100 rounded-xl flex items-center justify-center">
                    <AlertCircle className="w-5 h-5 text-orange-600" />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-800 text-base">Genel Ayarlar</h3>
                    <p className="text-xs text-gray-500">Sipariş ve operasyon ayarları</p>
                  </div>
                </div>
                <div className="flex items-center justify-between py-3 border-t border-gray-100">
                  <div className="flex-1">
                    <div className="font-semibold text-gray-800 text-sm">İptal Açıklaması Zorunlu</div>
                    <div className="text-xs text-gray-500 mt-0.5">Ürün iptal edilirken garsondan açıklama istenir</div>
                  </div>
                  <button onClick={toggleRequireCancelReason} className="ml-4 shrink-0 transition-all active:scale-95">
                    {requireCancelReason
                      ? <ToggleRight className="w-10 h-10 text-orange-500" />
                      : <ToggleLeft className="w-10 h-10 text-gray-400" />
                    }
                  </button>
                </div>
              </div>
            </div>
          ) : activeTab === 'tables' ? (
            <div className="space-y-6">
              <div className="bg-gray-50 rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-gray-800">Masa Grupları</h3>
                  <button
                    onClick={() => {
                      setGroupBranchId(activeBranch?.id || '');
                      setShowGroupForm(!showGroupForm);
                    }}
                    className="flex items-center space-x-2 bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-lg transition"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Yeni Grup</span>
                  </button>
                </div>

                {showGroupForm && (
                  <form onSubmit={handleCreateGroup} className="bg-white rounded-xl p-4 mb-4 space-y-3 border border-orange-100">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Grup Adı</label>
                        <input
                          type="text"
                          value={groupName}
                          onChange={(e) => setGroupName(e.target.value)}
                          placeholder="Örn: Salon"
                          className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Kısa Kod (Önek)</label>
                        <input
                          type="text"
                          value={groupPrefix}
                          onChange={(e) => setGroupPrefix(e.target.value.toUpperCase())}
                          placeholder="Örn: S"
                          maxLength={3}
                          className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:border-transparent uppercase"
                          required
                        />
                      </div>
                    </div>
                    {branches.length > 0 && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Şube <span className="text-red-500">*</span></label>
                        <select
                          value={groupBranchId}
                          onChange={e => setGroupBranchId(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                          required
                        >
                          <option value="">Şube Seçin</option>
                          {branches.map(b => (
                            <option key={b.id} value={b.id}>{b.name}{b.is_main ? ' (Ana Şube)' : ''}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Renk</label>
                      <input
                        type="color"
                        value={groupColor}
                        onChange={(e) => setGroupColor(e.target.value)}
                        className="w-full h-10 rounded-lg border border-gray-300"
                      />
                    </div>
                    <div className="flex space-x-2">
                      <button type="submit" className="flex-1 bg-orange-600 hover:bg-orange-700 text-white py-2 rounded-lg transition">Oluştur</button>
                      <button type="button" onClick={() => setShowGroupForm(false)} className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 py-2 rounded-lg transition">İptal</button>
                    </div>
                  </form>
                )}

                <div className="space-y-2">
                  {groups.map((group) => (
                    <div
                      key={group.id}
                      className="bg-white rounded-lg p-4 flex items-center justify-between"
                    >
                      <div className="flex items-center space-x-4">
                        <div
                          className="w-12 h-12 rounded-lg flex items-center justify-center text-white font-bold"
                          style={{ backgroundColor: group.color }}
                        >
                          {group.prefix}
                        </div>
                        <div>
                          <h4 className="font-semibold text-gray-800">{group.name}</h4>
                          <p className="text-sm text-gray-500">Kod: {group.prefix}</p>
                          {(group as any).branches && (
                            <p className="text-xs text-orange-600 font-medium mt-0.5">{(group as any).branches.name}</p>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeleteGroup(group.id)}
                        className="text-red-500 hover:text-red-700 p-2 rounded-lg hover:bg-red-50 transition"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  ))}
                  {groups.length === 0 && (
                    <p className="text-gray-500 text-center py-8">Henüz grup oluşturulmamış</p>
                  )}
                </div>
              </div>

              <div className="bg-gray-50 rounded-xl p-6">
                <h3 className="text-lg font-bold text-gray-800 mb-4">Masa Oluştur</h3>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Masa Grubu Seçin</label>
                    <select
                      value={selectedGroup || ''}
                      onChange={(e) => setSelectedGroup(e.target.value)}
                      className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    >
                      <option value="">Grup Seçin</option>
                      {groups
                        .filter(g => !tableBranchId || (g as any).branch_id === tableBranchId || !(g as any).branch_id)
                        .map((group) => (
                          <option key={group.id} value={group.id}>
                            {group.name} ({group.prefix}){(group as any).branches ? ` — ${(group as any).branches.name}` : ''}
                          </option>
                        ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Masa Kapasitesi
                    </label>
                    <input
                      type="number"
                      value={tableCapacity}
                      onChange={(e) => setTableCapacity(e.target.value)}
                      min="1"
                      max="20"
                      className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    />
                  </div>

                  {branches.length > 0 && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Şube <span className="text-red-500">*</span></label>
                      <select
                        value={tableBranchId}
                        onChange={(e) => { setTableBranchId(e.target.value); setSelectedGroup(null); }}
                        className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                      >
                        <option value="">Şube Seçin</option>
                        {branches.map((b) => (
                          <option key={b.id} value={b.id}>{b.name}{b.is_main ? ' (Ana Şube)' : ''}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      onClick={handleCreateSingleTable}
                      disabled={!selectedGroup}
                      className="bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                    >
                      Tekli Masa Ekle
                    </button>
                    <button
                      onClick={handleBulkCreateTables}
                      disabled={!selectedGroup}
                      className="bg-green-600 hover:bg-green-700 text-white py-3 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                    >
                      Çoklu Masa Ekle
                    </button>
                  </div>

                  {selectedGroup && (
                    <div className="bg-white rounded-lg p-4 space-y-3">
                      <label className="block text-sm font-medium text-gray-700">
                        Kaç Masa Oluşturulacak?
                      </label>
                      <input
                        type="number"
                        value={tableCount}
                        onChange={(e) => setTableCount(e.target.value)}
                        min="1"
                        max="100"
                        className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                      />
                      <button
                        onClick={handleBulkCreateTables}
                        className="w-full bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 text-white py-3 rounded-lg transition font-bold"
                      >
                        {tableCount} Masa Oluştur
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : activeTab === 'manage' ? (
            <div className="space-y-6">
              <div className="bg-gradient-to-r from-orange-500 to-red-600 rounded-xl p-4 md:p-8 text-white">
                <h3 className="text-lg md:text-2xl font-bold mb-2">Tüm Masaların Boyutunu Ayarla</h3>
                <p className="text-orange-50 text-sm md:text-base mb-4 md:mb-8">
                  Kaydırıcıyı kullanarak tüm masaların görünüm boyutunu aynı anda değiştirin
                </p>

                <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 md:p-8">
                  <div className="flex items-center justify-between mb-4 md:mb-6">
                    <div className="text-left">
                      <div className="text-xs md:text-sm text-orange-100 mb-1">Küçült</div>
                      <div className="w-8 h-8 md:w-12 md:h-12 bg-white/20 rounded-lg"></div>
                    </div>

                    <div className="flex-1 mx-4 md:mx-8">
                      <div className="text-center mb-4">
                        <div className="text-4xl font-bold mb-2">
                          {globalTableSize === 'small' ? 'Küçük' :
                           globalTableSize === 'medium' ? 'Orta' :
                           globalTableSize === 'large' ? 'Büyük' : 'Çok Büyük'}
                        </div>
                        <div className="text-orange-100 text-sm">
                          {globalTableSize === 'small' ? '1x1 Alan' :
                           globalTableSize === 'medium' ? '1x1 Alan' :
                           globalTableSize === 'large' ? '2x1 Alan' : '2x2 Alan'}
                        </div>
                      </div>

                      <input
                        type="range"
                        min="1"
                        max="4"
                        step="1"
                        value={
                          globalTableSize === 'small' ? 1 :
                          globalTableSize === 'medium' ? 2 :
                          globalTableSize === 'large' ? 3 : 4
                        }
                        onChange={(e) => {
                          const value = e.target.value;
                          const size = value === '1' ? 'small' :
                                     value === '2' ? 'medium' :
                                     value === '3' ? 'large' : 'xlarge';
                          setGlobalTableSize(size);
                          handleUpdateAllTablesSizes(size);
                        }}
                        className="w-full h-3 bg-white/30 rounded-full appearance-none cursor-pointer"
                        style={{
                          background: `linear-gradient(to right, #fff 0%, #fff ${((globalTableSize === 'small' ? 1 : globalTableSize === 'medium' ? 2 : globalTableSize === 'large' ? 3 : 4) - 1) * 33.33}%, rgba(255,255,255,0.3) ${((globalTableSize === 'small' ? 1 : globalTableSize === 'medium' ? 2 : globalTableSize === 'large' ? 3 : 4) - 1) * 33.33}%, rgba(255,255,255,0.3) 100%)`
                        }}
                      />

                      <div className="flex justify-between mt-2 text-xs text-orange-100">
                        <span>Küçük</span>
                        <span>Orta</span>
                        <span>Büyük</span>
                        <span>Çok Büyük</span>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-xs md:text-sm text-orange-100 mb-1">Büyüt</div>
                      <div className="w-12 h-12 md:w-20 md:h-20 bg-white/20 rounded-lg"></div>
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-2 md:gap-4 mt-4 md:mt-6">
                    <button
                      onClick={() => {
                        setGlobalTableSize('small');
                        handleUpdateAllTablesSizes('small');
                      }}
                      className={`bg-white/10 hover:bg-white/20 p-2 md:p-4 rounded-xl transition-all ${
                        globalTableSize === 'small' ? 'ring-4 ring-white' : ''
                      }`}
                    >
                      <div className="w-6 h-6 md:w-10 md:h-10 bg-white/40 rounded-lg mx-auto mb-1 md:mb-2"></div>
                      <div className="text-xs md:text-sm font-bold">Küçük</div>
                    </button>

                    <button
                      onClick={() => {
                        setGlobalTableSize('medium');
                        handleUpdateAllTablesSizes('medium');
                      }}
                      className={`bg-white/10 hover:bg-white/20 p-2 md:p-4 rounded-xl transition-all ${
                        globalTableSize === 'medium' ? 'ring-4 ring-white' : ''
                      }`}
                    >
                      <div className="w-8 h-8 md:w-12 md:h-12 bg-white/40 rounded-lg mx-auto mb-1 md:mb-2"></div>
                      <div className="text-xs md:text-sm font-bold">Orta</div>
                    </button>

                    <button
                      onClick={() => {
                        setGlobalTableSize('large');
                        handleUpdateAllTablesSizes('large');
                      }}
                      className={`bg-white/10 hover:bg-white/20 p-2 md:p-4 rounded-xl transition-all ${
                        globalTableSize === 'large' ? 'ring-4 ring-white' : ''
                      }`}
                    >
                      <div className="w-10 h-8 md:w-16 md:h-12 bg-white/40 rounded-lg mx-auto mb-1 md:mb-2"></div>
                      <div className="text-xs md:text-sm font-bold">Büyük</div>
                    </button>

                    <button
                      onClick={() => {
                        setGlobalTableSize('xlarge');
                        handleUpdateAllTablesSizes('xlarge');
                      }}
                      className={`bg-white/10 hover:bg-white/20 p-2 md:p-4 rounded-xl transition-all ${
                        globalTableSize === 'xlarge' ? 'ring-4 ring-white' : ''
                      }`}
                    >
                      <div className="w-10 h-10 md:w-16 md:h-16 bg-white/40 rounded-lg mx-auto mb-1 md:mb-2"></div>
                      <div className="text-xs md:text-sm font-bold">Çok Büyük</div>
                    </button>
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 rounded-xl p-6">
                <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                  <h3 className="text-lg font-bold text-gray-800">Mevcut Masalar ({tables.length})</h3>
                  <div className="flex items-center gap-2">
                    {bulkSelectMode ? (
                      <>
                        <button
                          onClick={selectAllTables}
                          className="text-xs px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg transition font-medium"
                        >
                          Tümünü Seç
                        </button>
                        <button
                          onClick={deselectAllTables}
                          className="text-xs px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg transition font-medium"
                        >
                          Seçimi Kaldır
                        </button>
                        {selectedTables.size > 0 && (
                          <button
                            onClick={handleBulkDeleteTables}
                            className="text-xs px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg transition font-bold flex items-center gap-1.5"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            {selectedTables.size} Masayı Sil
                          </button>
                        )}
                        <button
                          onClick={() => { setBulkSelectMode(false); setSelectedTables(new Set()); }}
                          className="text-xs px-3 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg transition font-medium"
                        >
                          Vazgec
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setBulkSelectMode(true)}
                        className="text-xs px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-lg transition font-semibold flex items-center gap-1.5"
                      >
                        <CheckSquare className="w-3.5 h-3.5" />
                        Toplu Sil
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                  {tables.map((table) => {
                    const isSelected = selectedTables.has(table.id);
                    return (
                      <div
                        key={table.id}
                        onClick={() => bulkSelectMode && toggleTableSelection(table.id)}
                        className={`bg-white rounded-lg p-3 shadow-sm border-2 relative transition-all ${
                          bulkSelectMode ? 'cursor-pointer hover:border-red-300' : ''
                        } ${isSelected ? 'border-red-500 bg-red-50' : 'border-gray-200'}`}
                      >
                        {bulkSelectMode ? (
                          <div className="absolute top-1 right-1">
                            {isSelected
                              ? <CheckSquare className="w-4 h-4 text-red-500" />
                              : <Square className="w-4 h-4 text-gray-300" />
                            }
                          </div>
                        ) : (
                          <button
                            onClick={() => handleDeleteTable(table.id)}
                            className="absolute top-1 right-1 text-red-500 hover:text-red-700 p-1"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}

                        <div className="flex flex-col items-center space-y-2">
                          {table.table_groups && (
                            <div
                              className="w-8 h-8 rounded flex items-center justify-center text-white text-xs font-bold"
                              style={{ backgroundColor: table.table_groups.color }}
                            >
                              {table.table_groups.prefix}
                            </div>
                          )}
                          <div className="text-center">
                            <div className="font-bold text-sm text-gray-800">{table.table_number}</div>
                            <div className="text-xs text-gray-500">{table.capacity} kişi</div>
                          </div>
                          <div className={`text-xs px-2 py-1 rounded font-medium ${
                            table.payment_locked ? 'bg-red-500 text-white animate-pulse' :
                            table.status === 'available' ? 'bg-green-100 text-green-700' :
                            table.status === 'occupied' ? 'bg-red-100 text-red-700' :
                            'bg-yellow-100 text-yellow-700'
                          }`}>
                            {table.payment_locked ? '🔒 KİLİTLİ' :
                             table.status === 'available' ? 'Boş' :
                             table.status === 'occupied' ? 'Dolu' : 'Rezerve'}
                          </div>
                          {table.payment_locked && (
                            <button
                              onClick={() => handleUnlockTable(table.id)}
                              className="text-xs px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded font-bold transition-all active:scale-95"
                            >
                              Kilidi Aç
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {tables.length === 0 && (
                  <p className="text-gray-500 text-center py-16">
                    Henüz masa oluşturulmamış
                  </p>
                )}
              </div>
            </div>
          ) : activeTab === 'platforms' ? (
            <div className="space-y-6">
              <div className="bg-gradient-to-r from-orange-500 to-red-600 rounded-xl p-6 text-white">
                <h3 className="text-2xl font-bold mb-2">Online Sipariş Platformları</h3>
                <p className="text-orange-50">
                  Yemeksepeti, Getir Yemek gibi platformlardan sipariş alabilmek için platform bilgilerinizi girin
                </p>
              </div>

              <div className="bg-gray-50 rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-gray-800">Aktif Platformlar</h3>
                  <button
                    onClick={() => setShowPlatformForm(!showPlatformForm)}
                    className="flex items-center space-x-2 bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-lg transition"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Platform Ekle</span>
                  </button>
                </div>

                {showPlatformForm && (
                  <form onSubmit={handleCreatePlatform} className="bg-white rounded-lg p-5 mb-4 space-y-4 border border-orange-200">
                    <h4 className="font-bold text-gray-800 text-base border-b pb-2">
                      {editingPlatformId ? 'Platform Düzenle' : 'Yeni Platform Ekle'}
                    </h4>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Platform Adı
                        </label>
                        <input
                          type="text"
                          value={platformName}
                          onChange={(e) => setPlatformName(e.target.value)}
                          placeholder="Örn: Yemeksepeti"
                          className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Platform Kodu
                        </label>
                        <select
                          value={platformCode}
                          onChange={(e) => setPlatformCode(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                          required
                        >
                          <option value="">Seçin</option>
                          <option value="yemeksepeti">Yemeksepeti</option>
                          <option value="getir">Getir Yemek</option>
                          <option value="trendyol">Trendyol Yemek</option>
                          <option value="migros">Migros Yemek</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          {isGetirPlatform ? 'Getir Panel Kullanıcısı (E-posta)' : 'Kullanıcı Adı / Middleware Kullanıcısı'}
                        </label>
                        <input
                          type="text"
                          value={platformUsername}
                          onChange={(e) => setPlatformUsername(e.target.value)}
                          placeholder={isGetirPlatform ? 'ornek@firma.com' : 'Middleware kullanıcı adı'}
                          className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          {isGetirPlatform ? 'Platform Şifresi / Servis Şifresi' : 'Şifre / Middleware Şifresi'}
                        </label>
                        <input
                          type="password"
                          value={platformPassword}
                          onChange={(e) => setPlatformPassword(e.target.value)}
                          placeholder={isGetirPlatform ? 'Getir kullanıcı/servis şifresi' : 'Middleware şifresi'}
                          className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                        />
                      </div>
                    </div>

                    <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 space-y-3">
                      <h5 className="text-sm font-bold text-orange-800">
                        {isGetirPlatform ? 'Getir Entegrasyon Bilgileri' : 'Platform Entegrasyon Bilgileri'}
                      </h5>
                      {isGetirPlatform && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              App Secret Key
                            </label>
                            <input
                              type="text"
                              value={platformAppSecretKey}
                              onChange={(e) => setPlatformAppSecretKey(e.target.value)}
                              placeholder="Getir appSecretKey"
                              className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Restaurant Secret Key (Zorunlu)
                            </label>
                            <input
                              type="password"
                              value={platformRestaurantSecretKey}
                              onChange={(e) => setPlatformRestaurantSecretKey(e.target.value)}
                              placeholder="Getir restaurantSecretKey"
                              className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                            />
                          </div>
                        </div>
                      )}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {!isGetirPlatform && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Chain Code
                          </label>
                          <input
                            type="text"
                            value={platformChainCode}
                            onChange={(e) => setPlatformChainCode(e.target.value)}
                            placeholder="Örn: clog, s0hf"
                            className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                          />
                        </div>
                        )}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            {isGetirPlatform ? 'Remote Code / Vendor Code (Opsiyonel)' : 'Remote Code (Vendor Code)'}
                          </label>
                          <input
                            type="text"
                            value={platformRemoteCode}
                            onChange={(e) => setPlatformRemoteCode(e.target.value)}
                            placeholder="Örn: JayG4t0N, YwkV2pn3"
                            className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Platform Restaurant ID {(isGetirPlatform || isYemeksepetiPlatform) ? '(Zorunlu)' : ''}
                          </label>
                          <input
                            type="text"
                            value={platformRestaurantId}
                            onChange={(e) => setPlatformRestaurantId(e.target.value)}
                            placeholder="Platformdaki restoran ID"
                            className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                          />
                        </div>
                        {!isGetirPlatform && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Middleware URL
                          </label>
                          <input
                            type="text"
                            value={platformMiddlewareUrl}
                            onChange={(e) => setPlatformMiddlewareUrl(e.target.value)}
                            placeholder="https://middleware.example.com"
                            className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                          />
                        </div>
                        )}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Webhook Secret
                          </label>
                          <input
                            type="password"
                            value={platformWebhookSecret}
                            onChange={(e) => setPlatformWebhookSecret(e.target.value)}
                            placeholder="İstek doğrulama anahtarı"
                            className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          API Key (Opsiyonel)
                        </label>
                        <input
                          type="text"
                          value={platformApiKey}
                          onChange={(e) => setPlatformApiKey(e.target.value)}
                          placeholder="Platform API anahtarı"
                          className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Komisyon Oranı (%)
                        </label>
                        <input
                          type="number"
                          value={platformCommission}
                          onChange={(e) => setPlatformCommission(e.target.value)}
                          min="0"
                          max="100"
                          step="0.1"
                          className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                          required
                        />
                      </div>
                    </div>

                    <div className="flex space-x-2">
                      <button
                        type="submit"
                        className="flex-1 bg-orange-600 hover:bg-orange-700 text-white py-2 rounded-lg transition font-medium"
                      >
                        {editingPlatformId ? 'Güncelle' : 'Platform Ekle'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          resetPlatformForm();
                        }}
                        className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 py-2 rounded-lg transition"
                      >
                        İptal
                      </button>
                    </div>
                  </form>
                )}

                <div className="space-y-3">
                  {platforms.map((platform) => (
                    <div
                      key={platform.id}
                      className="bg-white rounded-lg p-4 border-2 border-gray-200"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <h4 className="font-bold text-gray-800 text-lg">{platform.platform_name}</h4>
                          <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-sm">
                            <div>
                              <span className="text-gray-400 text-xs">Platform Kodu</span>
                              <p className="text-gray-700 font-medium">{platform.platform_code}</p>
                            </div>
                            <div>
                              <span className="text-gray-400 text-xs">Komisyon</span>
                              <p className="text-gray-700 font-medium">%{platform.commission_rate}</p>
                            </div>
                            {platform.middleware_chain_code && (
                              <div>
                                <span className="text-gray-400 text-xs">Chain Code</span>
                                <p className="text-gray-700 font-mono font-medium">{platform.middleware_chain_code}</p>
                              </div>
                            )}
                            {platform.middleware_vendor_code && (
                              <div>
                                <span className="text-gray-400 text-xs">Remote Code</span>
                                <p className="text-gray-700 font-mono font-medium">{platform.middleware_vendor_code}</p>
                              </div>
                            )}
                            {platform.remote_id && (
                              <div>
                                <span className="text-gray-400 text-xs">Platform Restaurant ID</span>
                                <p className="text-gray-700 font-mono font-medium truncate">{platform.remote_id}</p>
                              </div>
                            )}
                            {platform.platform_code === 'getir' && (
                              <div>
                                <span className="text-gray-400 text-xs">Getir Kimlik Bilgileri</span>
                                <p className="text-gray-700 font-medium">
                                  appSecret: {platform.settings?.app_secret_key ? 'Kayitli' : 'Yok'} / restaurantSecret: {platform.settings?.restaurant_secret_key ? 'Kayitli' : 'Yok'}
                                </p>
                              </div>
                            )}
                            {platform.webhook_secret && (
                              <div>
                                <span className="text-gray-400 text-xs">Webhook Secret</span>
                                <p className="text-gray-700 font-medium">Kayitli</p>
                              </div>
                            )}
                            {platform.middleware_url && (
                              <div className="col-span-2">
                                <span className="text-gray-400 text-xs">Middleware URL</span>
                                <p className="text-gray-700 font-mono text-xs truncate">{platform.middleware_url}</p>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-2 shrink-0">
                          <button
                            onClick={() => handleTogglePlatform(platform.id, platform.is_active)}
                            className={`px-4 py-1.5 rounded-lg font-bold transition text-sm ${
                              platform.is_active
                                ? 'bg-green-600 hover:bg-green-700 text-white'
                                : 'bg-gray-300 hover:bg-gray-400 text-gray-700'
                            }`}
                          >
                            {platform.is_active ? 'AKTİF' : 'PASİF'}
                          </button>
                          <div className="flex gap-1">
                            <button
                              onClick={() => {
                                setEditingPlatformId(platform.id);
                                setPlatformName(platform.platform_name);
                                setPlatformCode(platform.platform_code);
                                setPlatformUsername(platform.middleware_username || platform.settings?.username || '');
                                setPlatformPassword(platform.middleware_password || platform.settings?.password || '');
                                setPlatformApiKey(platform.api_key || '');
                                setPlatformAppSecretKey(platform.settings?.app_secret_key || '');
                                setPlatformRestaurantSecretKey(platform.settings?.restaurant_secret_key || '');
                                setPlatformWebhookSecret(platform.webhook_secret || platform.settings?.webhook_secret || '');
                                setPlatformCommission(String(platform.commission_rate));
                                setPlatformChainCode(platform.middleware_chain_code || '');
                                setPlatformRemoteCode(platform.middleware_vendor_code || '');
                                setPlatformRestaurantId(platform.remote_id || '');
                                setPlatformMiddlewareUrl(platform.middleware_url || '');
                                setShowPlatformForm(true);
                              }}
                              className="text-blue-500 hover:text-blue-700 p-2 rounded-lg hover:bg-blue-50 transition"
                              title="Düzenle"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeletePlatform(platform.id)}
                              className="text-red-500 hover:text-red-700 p-2 rounded-lg hover:bg-red-50 transition"
                              title="Sil"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  {platforms.length === 0 && (
                    <p className="text-gray-500 text-center py-8">Henüz platform eklenmemiş</p>
                  )}
                </div>
              </div>

              <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-6">
                <h4 className="font-bold text-blue-900 mb-3">Webhook URL (Platformlara verin)</h4>
                <div className="bg-white rounded-lg p-3 font-mono text-sm break-all border border-blue-300">
                  {`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/online-order-webhook`}
                </div>
                <p className="text-blue-800 text-sm mt-3">
                  Bu URL'yi platform yönetim panellerinde webhook olarak tanımlayın. Siparişler otomatik olarak sisteme düşecektir.
                </p>
              </div>
            </div>
          ) : activeTab === 'printers' ? (
            <PrinterSettings />
          ) : activeTab === 'scale' ? (
            <ScaleCalibration />
          ) : activeTab === 'qr-menu' ? (
            <div className="space-y-4">
              <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl p-4 md:p-6 text-white">
                <div className="flex items-center gap-3 mb-1">
                  <QrCode className="w-6 h-6" />
                  <h3 className="text-lg md:text-2xl font-bold">QR Menü</h3>
                </div>
                <p className="text-white/85 text-sm">
                  Her şubeye özel QR menü; müşteri telefonuyla kod okutarak menüyü görür.
                  PNG veya PDF olarak indirin, masalara koyun.
                </p>
              </div>
              <QrMenuManager />
            </div>
          ) : activeTab === 'account' ? (
            <div className="space-y-5">
              <div className="bg-gradient-to-r from-orange-500 to-red-600 rounded-xl p-4 md:p-6 text-white">
                <div className="flex items-center gap-3 mb-1">
                  <Store className="w-6 h-6" />
                  <h3 className="text-lg md:text-xl font-bold">Hesap & Restoran Bilgileri</h3>
                </div>
                <p className="text-orange-50 text-sm">Restoran adı, adres ve kullanıcı bilgilerini güncelleyin</p>
              </div>

              <div className="bg-white border-2 border-gray-200 rounded-xl p-5 space-y-4">
                <div className="flex items-center gap-2 mb-1">
                  <Store className="w-4 h-4 text-orange-500" />
                  <h4 className="font-bold text-gray-800">Restoran Bilgileri</h4>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Restoran Adı</label>
                  <input
                    type="text"
                    value={restaurantName}
                    onChange={e => setRestaurantName(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm"
                    placeholder="Restoran adı"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Adres</label>
                  <input
                    type="text"
                    value={restaurantAddress}
                    onChange={e => setRestaurantAddress(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm"
                    placeholder="Restoran adresi"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Telefon</label>
                  <input
                    type="tel"
                    value={restaurantPhone}
                    onChange={e => setRestaurantPhone(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm"
                    placeholder="Telefon numarası"
                  />
                </div>
                <div className="pt-1 pb-1 border-t border-gray-100">
                  <p className="text-xs text-gray-400">E-posta adresi değiştirilemez</p>
                  <p className="text-sm font-medium text-gray-600 mt-0.5">{(tenant as any)?.email || '—'}</p>
                </div>
              </div>

              <div className="bg-white border-2 border-gray-200 rounded-xl p-5 space-y-4">
                <div className="flex items-center gap-2 mb-1">
                  <User className="w-4 h-4 text-blue-500" />
                  <h4 className="font-bold text-gray-800">Kullanıcı Bilgileri</h4>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Ad Soyad</label>
                  <input
                    type="text"
                    value={profileFullName}
                    onChange={e => setProfileFullName(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm"
                    placeholder="Ad Soyad"
                  />
                </div>
                <div className="pt-1 pb-1 border-t border-gray-100">
                  <p className="text-xs text-gray-400">E-posta adresi değiştirilemez</p>
                  <p className="text-sm font-medium text-gray-600 mt-0.5">{(profile as any)?.email || '—'}</p>
                </div>
                <div className="border-t border-gray-100 pt-2">
                  <p className="text-xs text-gray-400">Rol</p>
                  <p className="text-sm font-semibold text-gray-700 capitalize mt-0.5">{(profile as any)?.role || '—'}</p>
                </div>
              </div>

              <button
                onClick={handleSaveAccount}
                disabled={accountSaving}
                className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition active:scale-95 ${
                  accountSaved
                    ? 'bg-green-500 text-white'
                    : 'bg-orange-500 hover:bg-orange-600 text-white'
                } disabled:opacity-60 disabled:cursor-not-allowed`}
              >
                {accountSaved ? (
                  <><CheckCircle className="w-4 h-4" /> Kaydedildi</>
                ) : accountSaving ? (
                  <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Kaydediliyor...</>
                ) : (
                  <><Save className="w-4 h-4" /> Değişiklikleri Kaydet</>
                )}
              </button>
            </div>
          ) : activeTab === 'system' ? (
            <div className="space-y-5">
              <div className="bg-gradient-to-r from-slate-700 to-slate-900 rounded-xl p-4 md:p-6 text-white">
                <div className="flex items-center gap-3 mb-1">
                  <Globe className="w-6 h-6" />
                  <h3 className="text-lg md:text-xl font-bold">Sistem & Bağlantı Ayarları</h3>
                </div>
                <p className="text-slate-300 text-sm">Çalışma modu, internet bağlantısı ve sistem durumu</p>
              </div>

              <ShiftsToggleCard />
              <BusinessDayCutoffCard />
              <ShiftDefinitionsCard />

              <div className="bg-white border-2 border-gray-200 rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    {isOnline ? <Wifi className="w-5 h-5 text-green-500" /> : <WifiOff className="w-5 h-5 text-red-500" />}
                    <div>
                      <h4 className="font-bold text-gray-800">İnternet Bağlantısı</h4>
                      <p className={`text-sm font-semibold ${isOnline ? 'text-green-600' : 'text-red-600'}`}>
                        {isOnline ? 'Bağlı' : 'Bağlantı Yok'}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => window.location.reload()}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 text-sm hover:bg-gray-50 transition-all"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Yenile
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-xs text-gray-500">
                  <div className="bg-gray-50 rounded-lg p-2">
                    <div className="font-bold text-gray-700 text-sm">Sürüm</div>
                    <div>1.0.0</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-2">
                    <div className="font-bold text-gray-700 text-sm">Platform</div>
                    <div>{(window as any).electron ? 'Masaüstü' : 'Web'}</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-2">
                    <div className="font-bold text-gray-700 text-sm">Durum</div>
                    <div className={isOnline ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'}>{isOnline ? 'Online' : 'Offline'}</div>
                  </div>
                </div>
              </div>

              <div className="bg-white border-2 border-gray-200 rounded-xl p-5 space-y-4">
                <div className="flex items-center gap-2 mb-1">
                  <Globe className="w-4 h-4 text-slate-600" />
                  <h4 className="font-bold text-gray-800">Çalışma Modu</h4>
                </div>
                <p className="text-sm text-gray-500">Sistemin nasıl çalışacağını seçin. Değişiklik sonraki oturumdan itibaren geçerli olur.</p>
                <div className="space-y-3">
                  {([
                    { id: 'online', icon: <Wifi className="w-5 h-5" />, label: 'Bulut Bağlantılı', desc: 'Her şey sunucuda saklanır. Çoklu şube, raporlar, online siparişler. İnternet gerektirir.', color: 'border-blue-500 bg-blue-50', textColor: 'text-blue-700' },
                    { id: 'hybrid', icon: <RefreshCw className="w-5 h-5" />, label: 'Karma Mod', desc: 'Çevrimdışı çalışır, internet gelince otomatik senkronize eder. En güçlü mod.', color: 'border-amber-500 bg-amber-50', textColor: 'text-amber-700' },
                    { id: 'offline', icon: <WifiOff className="w-5 h-5" />, label: 'Bağımsız (Offline)', desc: 'İnternet gerektirmez. Tüm veriler yerel cihazda saklanır. Tek cihaz kullanımı için idealdir.', color: 'border-slate-500 bg-slate-50', textColor: 'text-slate-700' },
                  ] as const).map(mode => (
                    <button
                      key={mode.id}
                      onClick={() => setDeploymentMode(mode.id)}
                      className={`w-full text-left p-4 rounded-xl border-2 transition-all ${deploymentMode === mode.id ? mode.color : 'border-gray-200 bg-gray-50 hover:border-gray-300'}`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`mt-0.5 ${deploymentMode === mode.id ? mode.textColor : 'text-gray-400'}`}>{mode.icon}</div>
                        <div className="flex-1">
                          <div className={`font-bold text-sm ${deploymentMode === mode.id ? mode.textColor : 'text-gray-700'}`}>{mode.label}</div>
                          <div className="text-xs text-gray-500 mt-0.5">{mode.desc}</div>
                        </div>
                        {deploymentMode === mode.id && <CheckCircle className={`w-5 h-5 shrink-0 ${mode.textColor}`} />}
                      </div>
                    </button>
                  ))}
                </div>
                <button
                  onClick={handleSaveDeploymentMode}
                  disabled={deploymentSaving}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-slate-700 hover:bg-slate-800 text-white font-bold text-sm transition active:scale-95 disabled:opacity-60"
                >
                  {deploymentSaving ? (
                    <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Kaydediliyor...</>
                  ) : (
                    <><Save className="w-4 h-4" /> Çalışma Modunu Kaydet</>
                  )}
                </button>
              </div>

              <div className="bg-white border-2 border-gray-200 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <AlertCircle className="w-4 h-4 text-amber-500" />
                  <h4 className="font-bold text-gray-800">Önbellek & Performans</h4>
                </div>
                <p className="text-sm text-gray-500 mb-3">Uygulama önbelleğini temizleyerek performansı artırabilirsiniz. Verileriniz korunur.</p>
                <button
                  onClick={() => {
                    if ('caches' in window) {
                      caches.keys().then(names => names.forEach(name => caches.delete(name)));
                    }
                    localStorage.removeItem('productGridSize');
                    alert('Önbellek temizlendi. Sayfa yenilenecek.');
                    window.location.reload();
                  }}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg border-2 border-amber-200 text-amber-700 text-sm font-semibold hover:bg-amber-50 transition-all"
                >
                  <RefreshCw className="w-4 h-4" /> Önbelleği Temizle
                </button>
              </div>
            </div>
          ) : activeTab === 'security' ? (
            <div className="space-y-5">
              <div className="bg-gradient-to-r from-slate-700 to-slate-900 rounded-xl p-5 text-white">
                <div className="flex items-center gap-3 mb-1">
                  <ShieldCheck className="w-6 h-6" />
                  <h3 className="text-xl font-bold">Güvenlik & PIN Kilidi</h3>
                </div>
                <p className="text-slate-300 text-sm">Sistemi kilitlemek için PIN kodu belirleyin. Ekrandan ayrıldığınızda sistem kilitlenir.</p>
              </div>

              <div className="bg-white border-2 border-gray-200 rounded-xl p-5 space-y-4">
                <div className="flex items-center gap-3 mb-2">
                  <Lock className="w-5 h-5 text-slate-600" />
                  <h4 className="font-bold text-gray-800">Kilit PIN Kodu</h4>
                  {pinLoaded && currentPin && (
                    <span className="ml-auto text-xs bg-green-100 text-green-700 px-2.5 py-1 rounded-full font-semibold">PIN Aktif</span>
                  )}
                  {pinLoaded && !currentPin && (
                    <span className="ml-auto text-xs bg-gray-100 text-gray-500 px-2.5 py-1 rounded-full font-semibold">PIN Yok</span>
                  )}
                </div>

                {pinLoaded && currentPin && (
                  <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 flex items-center gap-3">
                    <CheckCircle className="w-4 h-4 text-green-600 shrink-0" />
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-green-800">Kilit PIN tanımlanmış</div>
                      <div className="text-xs text-green-600 flex items-center gap-1.5 mt-0.5">
                        <span>{showPin ? currentPin : '• '.repeat(currentPin.length).trim()}</span>
                        <button onClick={() => setShowPin(p => !p)} className="text-green-500 hover:text-green-700">
                          {showPin ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Yeni PIN (4-6 haneli)</label>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    value={pinValue}
                    onChange={e => { setPinValue(e.target.value.replace(/\D/g, '')); setPinError(''); }}
                    placeholder="Örn: 1234"
                    className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:ring-2 focus:ring-slate-400 focus:border-transparent text-center text-2xl tracking-[0.5em] font-mono"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">PIN Tekrar</label>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    value={pinConfirm}
                    onChange={e => { setPinConfirm(e.target.value.replace(/\D/g, '')); setPinError(''); }}
                    placeholder="PIN'i tekrar girin"
                    className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:ring-2 focus:ring-slate-400 focus:border-transparent text-center text-2xl tracking-[0.5em] font-mono"
                  />
                </div>

                {pinError && (
                  <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {pinError}
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={handleSavePin}
                    disabled={pinSaving}
                    className="flex-1 bg-slate-700 hover:bg-slate-800 text-white font-bold py-3 rounded-xl transition active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {pinSaving ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Kaydediliyor...</> : <><Save className="w-4 h-4" /> PIN Kaydet</>}
                  </button>
                  {currentPin && (
                    <button
                      onClick={async () => {
                        if (!tenant) return;
                        await supabase.from('tenants').update({ lock_pin: null } as any).eq('id', tenant.id);
                        setCurrentPin('');
                        setPinValue('');
                        setPinConfirm('');
                        await refreshProfile?.();
                      }}
                      className="px-4 py-3 rounded-xl border-2 border-red-200 text-red-600 font-semibold text-sm hover:bg-red-50 transition active:scale-95"
                    >
                      PIN Kaldir
                    </button>
                  )}
                </div>

                {pinSaved && (
                  <div className="flex items-center gap-2 text-green-700 text-sm bg-green-50 px-3 py-2 rounded-lg">
                    <CheckCircle className="w-4 h-4" />
                    PIN başarıyla kaydedildi
                  </div>
                )}
              </div>

              <div className="bg-white border-2 border-gray-200 rounded-xl p-5">
                <h4 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-500" />
                  PIN Kilidi Nasıl Çalışır?
                </h4>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li className="flex items-start gap-2"><span className="w-5 h-5 bg-slate-100 text-slate-600 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">1</span>PIN kodu belirledikten sonra menüden "Sistemi Kilitle" seçeneği aktifleşir</li>
                  <li className="flex items-start gap-2"><span className="w-5 h-5 bg-slate-100 text-slate-600 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">2</span>Kilit ekranında saat ve tarih görünür, PIN girişiyle sistem açılır</li>
                  <li className="flex items-start gap-2"><span className="w-5 h-5 bg-slate-100 text-slate-600 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">3</span>5 hatalı girmede 30 saniye kilitlenir</li>
                </ul>
              </div>
            </div>
          ) : activeTab === 'branch-products' ? (
            <div className="space-y-5">
              <div className="bg-gradient-to-r from-orange-500 to-red-600 rounded-xl p-5 text-white">
                <div className="flex items-center gap-3 mb-1">
                  <Package className="w-6 h-6" />
                  <h3 className="text-xl font-bold">Şube Ürün & Stok Yönetimi</h3>
                </div>
                <p className="text-orange-100 text-sm">Tüm ürünler ve stoklar tüm şubelerde ortak görünür. Ana şubede eklenen ürün tüm şubelerde aktif olur.</p>
              </div>

              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-sm text-emerald-800 flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <strong className="block mb-1">Ortak Ürün Kataloğu Aktif</strong>
                  Ana şubede ürün/kategori/stok eklediğinizde tüm şubelerde otomatik görünür. Her şube aynı fiyatları ve stok bilgilerini paylaşır.
                </div>
              </div>

              <div className="space-y-3">
                {branches.map(branch => {
                  const synced = branchProductSync[branch.id] !== false;
                  return (
                    <div key={branch.id} className={`bg-white border-2 rounded-xl p-4 flex items-center gap-4 ${branch.is_main ? 'border-orange-200' : 'border-gray-200'}`}>
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${branch.is_main ? 'bg-orange-100' : 'bg-gray-100'}`}>
                        <Building2 className={`w-5 h-5 ${branch.is_main ? 'text-orange-600' : 'text-gray-500'}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-gray-800">{branch.name}</span>
                          {branch.is_main && <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">Ana Şube</span>}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {branch.is_main ? 'Ana şube — merkezi katalog olarak kullanılır' : synced ? 'Merkezi katalog aktif' : 'Kendi kataloğunu kullanıyor'}
                        </div>
                      </div>
                      {!branch.is_main && (
                        <button
                          onClick={() => handleToggleBranchSync(branch.id, !synced)}
                          className="transition active:scale-95 shrink-0"
                        >
                          {synced
                            ? <ToggleRight className="w-10 h-10 text-orange-500" />
                            : <ToggleLeft className="w-10 h-10 text-gray-400" />
                          }
                        </button>
                      )}
                      {branch.is_main && (
                        <span className="text-xs bg-orange-100 text-orange-600 px-3 py-1.5 rounded-xl font-semibold shrink-0">Merkez</span>
                      )}
                    </div>
                  );
                })}
                {branches.length === 0 && (
                  <div className="text-center py-12 text-gray-400">
                    <Building2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p>Henüz şube oluşturulmamış</p>
                  </div>
                )}
              </div>

              {branchSyncSaving && (
                <div className="text-center text-sm text-gray-500">Kaydediliyor...</div>
              )}

              {(() => {
                const isCenterUser = !!activeBranch?.is_main && profile?.role === 'owner';
                return (
                  <div className={`rounded-xl border-2 p-5 ${isCenterUser ? 'border-red-200 bg-red-50/40' : 'border-slate-200 bg-slate-50'}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <AlertCircle className={`w-5 h-5 ${isCenterUser ? 'text-red-600' : 'text-slate-400'}`} />
                      <h4 className={`font-bold ${isCenterUser ? 'text-red-800' : 'text-slate-600'}`}>Merkez Sube Stok Sifirlama</h4>
                    </div>
                    <p className={`text-sm mb-4 ${isCenterUser ? 'text-red-700' : 'text-slate-500'}`}>
                      Bu islem secilen subedeki tum urun stoklarini sifirlar. Sadece merkez kullanici (ana sube owner) yapabilir.
                    </p>
                    <div className="grid md:grid-cols-3 gap-3">
                      <select
                        value={inventoryResetBranchId}
                        onChange={(e) => setInventoryResetBranchId(e.target.value)}
                        disabled={!isCenterUser || inventoryResetLoading}
                        className="px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white disabled:bg-slate-100"
                      >
                        <option value="">Sube secin</option>
                        {branches.map((b) => (
                          <option key={b.id} value={b.id}>{b.name}{b.is_main ? ' (Ana Sube)' : ''}</option>
                        ))}
                      </select>
                      <input
                        type="password"
                        inputMode="numeric"
                        maxLength={6}
                        value={inventoryResetPin}
                        onChange={(e) => setInventoryResetPin(e.target.value.replace(/\D/g, ''))}
                        disabled={!isCenterUser || inventoryResetLoading}
                        placeholder="Merkez PIN"
                        className="px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white disabled:bg-slate-100"
                      />
                      <button
                        onClick={handleResetBranchInventory}
                        disabled={!isCenterUser || inventoryResetLoading}
                        className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50"
                      >
                        {inventoryResetLoading ? 'Sifirlaniyor...' : 'Stogu Sifirla'}
                      </button>
                    </div>
                    {inventoryResetMessage && (
                      <div className={`mt-3 text-sm ${inventoryResetMessage.includes('basariyla') ? 'text-green-700' : 'text-red-700'}`}>
                        {inventoryResetMessage}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          ) : activeTab === 'caller-id' ? (
            <div className="space-y-5">
              <div className="bg-gradient-to-r from-orange-500 to-red-600 rounded-xl p-5 text-white">
                <div className="flex items-center gap-3 mb-1">
                  <PhoneIncoming className="w-6 h-6" />
                  <h3 className="text-xl font-bold">Arayan No (Caller ID)</h3>
                </div>
                <p className="text-orange-50 text-sm">
                  Cidshow / cid.dll ile çalışan caller-id kutusu çağrı geldiğinde müşteriyi otomatik bulur.
                  Paket Servis ekranında bildirim çıkar; <b>Pakete aç</b> ile sipariş formu telefon doldurulmuş şekilde gelir.
                </p>
              </div>

              {!cidAvailable && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <div>
                    Caller ID yalnızca <b>ŞefPOS Masaüstü (Electron)</b> sürümünde çalışır. Tarayıcı versiyonunda
                    cihaza erişim yoktur. Lütfen masaüstü uygulamasını kullanın.
                  </div>
                </div>
              )}

              {cidAvailable && (
                <>
                  <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-slate-800">Aktif / Pasif</div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          Açıkken DLL yüklenir ve çağrılar dinlenir. Cihaz olmasa bile dinleme aktif tutulabilir.
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={cidBusy}
                        onClick={() =>
                          void cidSaveAndApply({
                            autoStart: cidSettings.autoStart,
                            softTest: cidSettings.softTest,
                            enabled: !cidStatusInfo.running,
                          })
                        }
                        className="flex items-center gap-2 disabled:opacity-50"
                        aria-pressed={cidStatusInfo.running}
                      >
                        {cidStatusInfo.running ? (
                          <ToggleRight className="w-10 h-10 text-emerald-500" />
                        ) : (
                          <ToggleLeft className="w-10 h-10 text-slate-400" />
                        )}
                        <span className={`text-sm font-bold ${cidStatusInfo.running ? 'text-emerald-700' : 'text-slate-500'}`}>
                          {cidStatusInfo.running ? 'AKTİF' : 'PASİF'}
                        </span>
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100">
                      <label className="flex items-start gap-2 p-2 rounded-lg bg-slate-50 border border-slate-200 cursor-pointer">
                        <input
                          type="checkbox"
                          className="mt-0.5"
                          checked={cidSettings.autoStart}
                          onChange={(e) =>
                            void cidSaveAndApply({
                              autoStart: e.target.checked,
                              softTest: cidSettings.softTest,
                              enabled: e.target.checked ? true : cidStatusInfo.running,
                            })
                          }
                        />
                        <span>
                          <div className="text-sm font-bold text-slate-700">Açılışta otomatik başlat</div>
                          <div className="text-xs text-slate-500">ŞefPOS açıldığında dinleyici kendiliğinden aktif olsun</div>
                        </span>
                      </label>
                      <label className="flex items-start gap-2 p-2 rounded-lg bg-slate-50 border border-slate-200 cursor-pointer">
                        <input
                          type="checkbox"
                          className="mt-0.5"
                          checked={cidSettings.softTest}
                          onChange={(e) =>
                            void cidSaveAndApply({
                              autoStart: cidSettings.autoStart,
                              softTest: e.target.checked,
                              enabled: cidStatusInfo.running,
                            })
                          }
                        />
                        <span>
                          <div className="text-sm font-bold text-slate-700 flex items-center gap-1">
                            <FlaskConical className="w-3.5 h-3.5" /> Soft test (cihazsız sahte çağrı)
                          </div>
                          <div className="text-xs text-slate-500">DLL otomatik periyodik test çağrıları üretir; gerçek cihaz olmadan akışı denersiniz</div>
                        </span>
                      </label>
                    </div>
                  </div>

                  <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
                    <div className="text-xs uppercase font-bold tracking-wider text-slate-400">Durum</div>
                    <div className="flex items-center gap-2 text-sm">
                      <div
                        className={`w-2.5 h-2.5 rounded-full ${
                          cidStatusInfo.running
                            ? cidStatusInfo.connected
                              ? 'bg-emerald-500'
                              : 'bg-amber-500'
                            : 'bg-slate-300'
                        }`}
                      />
                      <span className="font-bold text-slate-700">
                        {cidStatusInfo.running
                          ? cidStatusInfo.connected
                            ? `Cihaz bağlı: ${cidStatusInfo.deviceModel || 'Bilinmiyor'}`
                            : 'Dinleniyor (cihaz görünmüyor)'
                          : 'Pasif'}
                      </span>
                    </div>
                    {cidStatusInfo.deviceSerial && (
                      <div className="text-xs text-slate-500">Seri No: {cidStatusInfo.deviceSerial}</div>
                    )}
                    {cidStatusInfo.dllPath && (
                      <div className="text-xs text-slate-500 break-all">DLL: {cidStatusInfo.dllPath}</div>
                    )}
                    {cidStatusInfo.softTest && (
                      <div className="text-xs text-purple-600">Soft test çağrıları aktif.</div>
                    )}
                    {cidError && (
                      <div className="text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-lg px-2 py-1">{cidError}</div>
                    )}
                  </div>

                  <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-bold text-slate-800">Test çağrısı gönder</div>
                      <div className="text-xs text-slate-500">Telefon yazıp test edin: paket sayfasında bildirim açılır.</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const phone = window.prompt('Test çağrısı için telefon (örn 05551112233):', '05551112233');
                        if (!phone) return;
                        simulateRing(phone);
                      }}
                      className="px-3 py-2 rounded-lg text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 inline-flex items-center gap-1.5"
                    >
                      <FlaskConical className="w-3.5 h-3.5" />
                      Test
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : activeTab === 'devices' ? (
            <DeviceManagement />
          ) : activeTab === 'waiters' ? (
            <div className="space-y-4">
              <div className="bg-gradient-to-r from-orange-500 to-red-600 rounded-xl p-4 md:p-6 text-white">
                <div className="flex items-center gap-3 mb-2">
                  <User className="w-6 h-6" />
                  <h3 className="text-lg md:text-2xl font-bold">Garson Yönetimi</h3>
                </div>
                <p className="text-orange-50 text-sm">Garsonlarınızı ekleyin ve telefonlarından PIN ile giriş yapmalarını sağlayın</p>
              </div>
              {tenant && <WaiterManagement tenantId={tenant.id} />}
            </div>
          ) : activeTab === 'hugin' ? (
            <div className="space-y-5">
              <div className="bg-gradient-to-r from-slate-700 to-slate-800 rounded-xl p-5 text-white">
                <div className="flex items-center gap-3 mb-1">
                  <Receipt className="w-6 h-6" />
                  <h3 className="text-xl font-bold">Hugin S1 Yazarkasa Entegrasyonu</h3>
                </div>
                <p className="text-slate-300 text-sm">Nakit odeme alindiginda Hugin S1 yazarkasaniza otomatik fis keser. Cihazin ayni ag uzerinde olmasi gerekir.</p>
              </div>

              <div className="bg-white border-2 border-slate-200 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-slate-800">Yazarkasa Entegrasyonu</h4>
                    <p className="text-sm text-slate-500 mt-0.5">Aktif edildiginde nakit odemede otomatik fis basilir</p>
                  </div>
                  <button
                    onClick={() => setHuginSettings(s => ({ ...s, enabled: !s.enabled }))}
                    className={`relative w-12 h-7 rounded-full transition-all ${huginSettings.enabled ? 'bg-green-500' : 'bg-slate-300'}`}
                  >
                    <div className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-all ${huginSettings.enabled ? 'left-6' : 'left-1'}`} />
                  </button>
                </div>

                {huginSettings.enabled && (
                  <div className="border-t border-slate-100 pt-4 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1">Cihaz IP Adresi</label>
                        <input
                          type="text"
                          value={huginSettings.deviceIp}
                          onChange={e => setHuginSettings(s => ({ ...s, deviceIp: e.target.value }))}
                          className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-transparent text-sm font-mono"
                          placeholder="192.168.1.100"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1">Port</label>
                        <input
                          type="number"
                          value={huginSettings.devicePort}
                          onChange={e => setHuginSettings(s => ({ ...s, devicePort: parseInt(e.target.value) || 3001 }))}
                          className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-transparent text-sm font-mono"
                          placeholder="3001"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1">OKC ID</label>
                        <input
                          type="text"
                          value={huginSettings.okcId}
                          onChange={e => setHuginSettings(s => ({ ...s, okcId: e.target.value }))}
                          className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-transparent text-sm"
                          placeholder="Cihaz kimlik numarasi"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1">Sifre</label>
                        <input
                          type="password"
                          value={huginSettings.password}
                          onChange={e => setHuginSettings(s => ({ ...s, password: e.target.value }))}
                          className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-transparent text-sm"
                          placeholder="Cihaz sifresi"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1">Varsayilan KDV Orani (%)</label>
                        <select
                          value={huginSettings.vatRate}
                          onChange={e => setHuginSettings(s => ({ ...s, vatRate: parseInt(e.target.value) }))}
                          className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-transparent text-sm"
                        >
                          <option value={0}>%0</option>
                          <option value={1}>%1</option>
                          <option value={8}>%8</option>
                          <option value={10}>%10</option>
                          <option value={18}>%18</option>
                          <option value={20}>%20</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1">Varsayilan Departman No</label>
                        <input
                          type="number"
                          min="1"
                          value={huginSettings.departmentId}
                          onChange={e => setHuginSettings(s => ({ ...s, departmentId: parseInt(e.target.value) || 1 }))}
                          className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-transparent text-sm"
                          placeholder="1"
                        />
                      </div>
                    </div>

                    {huginCategories.length > 0 && (
                      <div className="border border-slate-200 rounded-xl overflow-hidden">
                        <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200">
                          <p className="text-sm font-bold text-slate-700">Kategori Bazli KDV ve Departman</p>
                          <p className="text-xs text-slate-500 mt-0.5">Bos birakirsaniz varsayilan degerler kullanilir</p>
                        </div>
                        <div className="divide-y divide-slate-100">
                          {huginCategories.map(cat => (
                            <div key={cat.id} className="flex items-center gap-3 px-4 py-2.5">
                              <span className="text-sm font-medium text-slate-700 w-32 flex-shrink-0 truncate">{cat.name}</span>
                              <div className="flex items-center gap-1.5 flex-1">
                                <select
                                  value={cat.vat_rate ?? ''}
                                  onChange={async e => {
                                    const val = e.target.value === '' ? null : parseInt(e.target.value);
                                    setHuginCategories(prev => prev.map(c => c.id === cat.id ? { ...c, vat_rate: val } : c));
                                    setHuginCategorySaving(cat.id);
                                    await supabase.from('categories').update({ vat_rate: val } as any).eq('id', cat.id);
                                    setHuginCategorySaving(null);
                                  }}
                                  className="px-2 py-1.5 border border-slate-300 rounded-lg text-xs font-medium focus:ring-2 focus:ring-slate-400 focus:border-transparent"
                                >
                                  <option value="">Varsayilan</option>
                                  <option value={0}>%0</option>
                                  <option value={1}>%1</option>
                                  <option value={8}>%8</option>
                                  <option value={10}>%10</option>
                                  <option value={18}>%18</option>
                                  <option value={20}>%20</option>
                                </select>
                                <input
                                  type="number"
                                  min="1"
                                  placeholder="Dept. No"
                                  value={cat.hugin_department_id ?? ''}
                                  onChange={async e => {
                                    const val = e.target.value === '' ? null : parseInt(e.target.value);
                                    setHuginCategories(prev => prev.map(c => c.id === cat.id ? { ...c, hugin_department_id: val } : c));
                                    setHuginCategorySaving(cat.id);
                                    await supabase.from('categories').update({ hugin_department_id: val } as any).eq('id', cat.id);
                                    setHuginCategorySaving(null);
                                  }}
                                  className="w-20 px-2 py-1.5 border border-slate-300 rounded-lg text-xs font-mono focus:ring-2 focus:ring-slate-400 focus:border-transparent"
                                />
                                {huginCategorySaving === cat.id && (
                                  <span className="text-xs text-slate-400">Kaydediliyor...</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {huginTestResult && (
                      <div className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium ${huginTestResult.ok ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                        {huginTestResult.ok ? <CheckCircle className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
                        {huginTestResult.msg}
                      </div>
                    )}

                    <button
                      onClick={async () => {
                        setHuginTesting(true);
                        setHuginTestResult(null);
                        const result = await testHuginConnection(huginSettings);
                        setHuginTestResult({ ok: result.success, msg: result.success ? 'Cihaza basariyla baglandi!' : (result.error || 'Baglanti hatasi') });
                        setHuginTesting(false);
                      }}
                      disabled={huginTesting}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border-2 border-slate-300 hover:border-slate-400 rounded-lg text-sm font-semibold text-slate-700 transition-all disabled:opacity-50"
                    >
                      <Wifi className="w-4 h-4" />
                      {huginTesting ? 'Test ediliyor...' : 'Baglanti Test Et'}
                    </button>
                  </div>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={async () => {
                    setHuginSaving(true);
                    saveHuginSettings(huginSettings);
                    setHuginSaved(true);
                    setHuginSaving(false);
                    setTimeout(() => setHuginSaved(false), 2000);
                  }}
                  disabled={huginSaving}
                  className="flex items-center gap-2 px-5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-sm font-bold transition-all disabled:opacity-50"
                >
                  {huginSaved ? <CheckCircle className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                  {huginSaved ? 'Kaydedildi' : 'Kaydet'}
                </button>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
                <p className="font-semibold mb-1">Kurulum Notu</p>
                <ul className="space-y-1 list-disc list-inside text-amber-700">
                  <li>Hugin S1 cihazi bilgisayarinizla ayni ag (Wi-Fi/LAN) uzerinde olmali</li>
                  <li>Cihazin IP adresini Hugin S1 ekranindaki ag ayarlarindan ogrenebilirsiniz</li>
                  <li>OKC ID ve sifre bilgilerini Hugin yetkili servisinden alin</li>
                  <li>Nakit ve kredi karti odemelerde otomatik fis kesilir</li>
                  <li>Kismi odeme durumunda her odeme ayri PayItem olarak gonderilir</li>
                </ul>
              </div>
            </div>
          ) : activeTab === 'database' ? (
            <div className="space-y-5">
              <div className="bg-gradient-to-r from-slate-700 to-slate-800 rounded-xl p-5 text-white">
                <div className="flex items-center gap-3 mb-1">
                  <DatabaseIcon className="w-6 h-6" />
                  <h3 className="text-xl font-bold">SQL Server Bağlantısı</h3>
                </div>
                <p className="text-slate-300 text-sm">Yerel SQL Server veritabanı bağlantı bilgilerini buradan güncelleyebilirsiniz.</p>
              </div>

              <div className="bg-white border-2 border-emerald-200 rounded-xl p-5">
                <SqlServerSettings inline showBack={false} />
              </div>
            </div>
          ) : (
            <div className="bg-gray-50 rounded-xl p-6">
              <h3 className="text-lg font-bold text-gray-800 mb-4">Ürün ve Stok Yönetimi</h3>
              <p className="text-gray-500 text-center py-16">
                Ürün ve stok yönetimi özellikleri yakında eklenecek
              </p>
            </div>
          )}
          </div>
        </main>
      </div>
    </div>
  );
}

function ScaleTestSection() {
  const electronAPI = (window as any).electronAPI;
  const [scalePort, setScalePort] = useState('COM1');
  const [isConnected, setIsConnected] = useState(false);
  const [currentWeight, setCurrentWeight] = useState<number | null>(null);
  const [stabilized, setStabilized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testLog, setTestLog] = useState<string[]>([]);
  const testListenersCleanupRef = useRef<(() => void) | null>(null);

  const clearTestListeners = () => {
    testListenersCleanupRef.current?.();
    testListenersCleanupRef.current = null;
  };

  useEffect(() => () => clearTestListeners(), []);

  const addLog = (msg: string) => {
    setTestLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  const startTest = async () => {
    if (!electronAPI) {
      setError('Electron API yok - Bu işlem sadece Electron uygulamasında çalışır');
      return;
    }

    clearTestListeners();

    setError(null);
    setTestLog([]);
    addLog('Terazi bağlantısı başlatılıyor...');

    try {
      const result = await electronAPI.scaleStartWeighing?.({
        port: scalePort,
        baudRate: 9600
      });

      if (!result?.success) {
        setError(result?.error || 'Bağlantı başarısız');
        addLog(`Hata: ${result?.error}`);
        return;
      }

      setIsConnected(true);
      addLog(`${scalePort} bağlandı`);
      addLog('Terazi verisi bekleniyor...');

      const unsubWeight = electronAPI.onScaleWeightUpdate?.((data: any) => {
        setCurrentWeight(data.weight);
        setStabilized(data.stabilized);
        addLog(`Ağırlık: ${(data.weight / 1000).toFixed(3)} kg ${data.stabilized ? '✓ Kararlı' : '(değişiyor)'}`);
      });

      const unsubError = electronAPI.onScaleWeighingError?.((data: any) => {
        setError(data.error);
        addLog(`Bağlantı hatası: ${data.error}`);
        setIsConnected(false);
      });

      testListenersCleanupRef.current = () => {
        unsubWeight?.();
        unsubError?.();
      };
    } catch (err: any) {
      setError(err.message);
      addLog(`Hata: ${err.message}`);
      setIsConnected(false);
    }
  };

  const stopTest = async () => {
    clearTestListeners();
    try {
      await electronAPI.scaleStopWeighing?.();
      setIsConnected(false);
      setCurrentWeight(null);
      addLog('Bağlantı kapatıldı');
    } catch (err: any) {
      addLog(`Kapatma hatası: ${err.message}`);
    }
  };

  return (
    <div className="space-y-5">
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl p-4 md:p-6 text-white">
        <div className="flex items-center gap-3 mb-1">
          <Scale className="w-6 h-6" />
          <h3 className="text-lg md:text-xl font-bold">Terazi Test Aracı</h3>
        </div>
        <p className="text-blue-50 text-sm">RS232 bağlantılı terazinizi test edin (CAS ERJ vb.)</p>
      </div>

      <div className="bg-white border-2 border-slate-200 rounded-xl p-6 space-y-4">
        <div className="space-y-3">
          <label className="block">
            <span className="text-sm font-bold text-slate-700 mb-2 block">COM Port Seçimi</span>
            <select
              value={scalePort}
              onChange={e => setScalePort(e.target.value)}
              disabled={isConnected}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              {['COM1', 'COM2', 'COM3', 'COM4', 'COM5'].map(port => (
                <option key={port} value={port}>{port}</option>
              ))}
            </select>
          </label>

          <div className="flex gap-3">
            <button
              onClick={startTest}
              disabled={isConnected}
              className={`flex-1 px-4 py-3 rounded-lg font-bold text-white transition-all active:scale-95 ${
                isConnected
                  ? 'bg-slate-300 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {isConnected ? 'Bağlı...' : 'Bağlantıyı Başlat'}
            </button>
            {isConnected && (
              <button
                onClick={stopTest}
                className="flex-1 px-4 py-3 rounded-lg font-bold text-white bg-red-600 hover:bg-red-700 transition-all active:scale-95"
              >
                Bağlantıyı Kes
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border-2 border-red-200 rounded-lg p-3 flex gap-2">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
            <div className="text-red-700 text-sm">{error}</div>
          </div>
        )}

        {isConnected && currentWeight !== null && (
          <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4 space-y-3">
            <div>
              <div className="text-xs font-bold text-blue-700 mb-1">Ağırlık</div>
              <div className="text-4xl font-black text-blue-600 font-mono">
                {(currentWeight / 1000).toFixed(3)}
              </div>
              <div className="text-lg font-bold text-blue-700">kg</div>
            </div>

            <div className={`text-xs font-bold px-3 py-1.5 rounded-full inline-block ${
              stabilized
                ? 'bg-green-200 text-green-800'
                : 'bg-amber-200 text-amber-800'
            }`}>
              {stabilized ? '✓ Kararlı' : '⟳ Ölçüm alınıyor...'}
            </div>
          </div>
        )}

        <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
          <div className="text-xs font-bold text-slate-600 mb-2">Test Günlüğü</div>
          <div className="bg-slate-900 text-slate-100 rounded text-xs font-mono p-3 h-48 overflow-y-auto space-y-1">
            {testLog.length === 0 ? (
              <div className="text-slate-500">Burada terazi test logları gösterilecek...</div>
            ) : (
              testLog.map((log, i) => (
                <div key={i} className="whitespace-pre-wrap break-words">{log}</div>
              ))
            )}
          </div>
          {testLog.length > 0 && (
            <button
              onClick={() => setTestLog([])}
              className="mt-2 px-3 py-1 text-xs bg-slate-300 hover:bg-slate-400 rounded text-slate-700 font-bold"
            >
              Temizle
            </button>
          )}
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800 space-y-2">
          <div className="font-bold">Bilgilendirme:</div>
          <ul className="list-disc list-inside space-y-1">
            <li>Terazi açık ve {scalePort} portuna bağlı olmalı</li>
            <li>Baud rate: 9600</li>
            <li>Test sırasında terazide ürün tartarak verisi gördüğünüzü kontrol edin</li>
            <li>3 ardışık aynı ölçüm "Kararlı" olarak işaretlenir</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function ShiftsToggleCard() {
  const { tenant, refreshProfile, isOwnerOrAdmin, shiftsEnabled } = useAuth();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const toggle = async (next: boolean) => {
    if (!tenant) return;
    setSaving(true);
    setError(null);
    setOk(null);
    try {
      const { error } = await (supabase as any)
        .from('tenants')
        .update({ shifts_enabled: next })
        .eq('id', tenant.id);
      if (error) throw error;
      setOk(next ? 'Vardiya sistemi açıldı.' : 'Vardiya sistemi kapatıldı.');
      await refreshProfile();
    } catch (e: any) {
      setError(e?.message || 'Güncellenemedi');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white border-2 border-gray-200 rounded-xl p-5">
      <div className="flex items-start gap-3 flex-wrap">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-rose-600 text-white flex items-center justify-center shadow shrink-0">
          <Clock className="w-6 h-6" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-bold text-gray-800">Vardiya & Gün Sonu Sistemi</h4>
          <p className="text-sm text-gray-500 mt-0.5">
            Açıkken: kasiyer giriş yaptığında <b>"Vardiyanız başlatıldı"</b> denir, kapatınca kişisel Z raporu çıkar. Aynı anda birden fazla kullanıcı kendi vardiyasında olabilir. Kapalıyken: vardiya/gün sonu özellikleri tamamen gizlenir.
          </p>
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${shiftsEnabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
              DURUM: {shiftsEnabled ? 'AÇIK' : 'KAPALI'}
            </span>
            {!isOwnerOrAdmin && (
              <span className="text-[11px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                Bu ayarı yalnız sahip/yönetici değiştirebilir
              </span>
            )}
          </div>
        </div>
        <button
          onClick={() => toggle(!shiftsEnabled)}
          disabled={saving || !isOwnerOrAdmin}
          className={`shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-black text-white shadow disabled:opacity-50 transition ${
            shiftsEnabled ? 'bg-gradient-to-r from-rose-500 to-orange-600 hover:from-rose-600 hover:to-orange-700' : 'bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700'
          }`}
        >
          {shiftsEnabled ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
          {shiftsEnabled ? 'Sistemi Kapat' : 'Sistemi Aç'}
        </button>
      </div>
      {(error || ok) && (
        <div className={`mt-3 text-sm rounded-lg px-3 py-2 ${error ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
          {error || ok}
        </div>
      )}
    </div>
  );
}

// ===========================================================================
// Is gunu cutoff saati (kart) — tenant ve sube bazli
// ===========================================================================

const HOURS_LIST = Array.from({ length: 24 }, (_, i) => i);

type DayMode = 'cutoff' | 'manual';

function BusinessDayCutoffCard() {
  const { tenant, isOwnerOrAdmin, branches, refreshBranches, refreshProfile } = useAuth() as any;
  const [tenantHour, setTenantHour] = useState<number>(6);
  const [tenantMode, setTenantMode] = useState<DayMode>('cutoff');
  const [branchOverrides, setBranchOverrides] = useState<Record<string, { hour: number | null; mode: DayMode | null }>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  useEffect(() => {
    if (tenant) {
      const v = (tenant as any).business_day_start_hour;
      setTenantHour(typeof v === 'number' ? v : 6);
      const m = (tenant as any).business_day_mode;
      setTenantMode(m === 'manual' ? 'manual' : 'cutoff');
    }
    const map: Record<string, { hour: number | null; mode: DayMode | null }> = {};
    branches.forEach((b: any) => {
      map[b.id] = {
        hour: typeof b.business_day_start_hour === 'number' ? b.business_day_start_hour : null,
        mode: b.business_day_mode === 'manual' || b.business_day_mode === 'cutoff' ? b.business_day_mode : null,
      };
    });
    setBranchOverrides(map);
  }, [tenant, branches]);

  const saveAll = async () => {
    if (!tenant) return;
    setSaving(true); setError(null); setOk(null);
    try {
      const { error: tErr } = await (supabase as any)
        .from('tenants')
        .update({
          business_day_start_hour: tenantHour,
          business_day_mode: tenantMode,
        })
        .eq('id', tenant.id);
      if (tErr) throw tErr;

      const updates = Object.entries(branchOverrides).map(([id, v]) =>
        (supabase as any).from('branches').update({
          business_day_start_hour: v.hour,
          business_day_mode: v.mode,
        }).eq('id', id)
      );
      const results = await Promise.all(updates);
      const failed = results.find((r: any) => r?.error);
      if (failed) throw failed.error;

      setOk('İş günü ayarları güncellendi. Sayfayı yenileyince geçerli olur.');
      await refreshBranches();
      await refreshProfile();
    } catch (e: any) {
      setError(e?.message || 'Kaydedilemedi');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white border-2 border-gray-200 rounded-xl p-5">
      <div className="flex items-start gap-3 flex-wrap">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 text-white flex items-center justify-center shadow shrink-0">
          <Clock className="w-6 h-6" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-bold text-gray-800">İş Günü Modu &amp; Başlangıç Saati</h4>
          <p className="text-sm text-gray-500 mt-0.5">
            <b>Otomatik (cutoff)</b>: Yeni iş günü her gün belirli saatte başlar
            (örn. 05:00). Standart işletmeler için.
            {' '}
            <b>Manuel (24/7)</b>: Cutoff yoktur; gün sadece "Günü Kapat"
            tıklayınca biter. 7 gün 24 saat açık işletmeler için.
          </p>
          {!isOwnerOrAdmin && (
            <div className="mt-2 text-[11px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full inline-block border border-amber-200">
              Bu ayarı yalnız sahip/yönetici değiştirebilir
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-3">
        <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 grid gap-3">
          <div className="text-xs font-black text-slate-600 uppercase tracking-wide">İşletme Geneli (Varsayılan)</div>
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => isOwnerOrAdmin && setTenantMode('cutoff')}
              disabled={!isOwnerOrAdmin}
              className={`px-3 py-2 rounded-lg text-sm font-black border-2 disabled:opacity-50 ${
                tenantMode === 'cutoff'
                  ? 'bg-sky-600 text-white border-sky-700'
                  : 'bg-white text-slate-700 border-slate-200 hover:border-sky-300'
              }`}
            >
              Otomatik (cutoff)
            </button>
            <button
              type="button"
              onClick={() => isOwnerOrAdmin && setTenantMode('manual')}
              disabled={!isOwnerOrAdmin}
              className={`px-3 py-2 rounded-lg text-sm font-black border-2 disabled:opacity-50 ${
                tenantMode === 'manual'
                  ? 'bg-indigo-600 text-white border-indigo-700'
                  : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-300'
              }`}
            >
              Manuel (24/7)
            </button>
          </div>
          {tenantMode === 'cutoff' && (
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Başlangıç Saati</label>
              <select
                value={tenantHour}
                onChange={(e) => setTenantHour(parseInt(e.target.value, 10))}
                disabled={!isOwnerOrAdmin}
                className="w-full md:w-48 px-3 py-2 rounded-lg border border-slate-200 bg-white font-bold text-slate-800 disabled:opacity-50"
              >
                {HOURS_LIST.map(h => (
                  <option key={h} value={h}>{String(h).padStart(2,'0')}:00</option>
                ))}
              </select>
            </div>
          )}
          {tenantMode === 'manual' && (
            <div className="text-[11px] text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2 leading-relaxed">
              Manuel modda gün ancak <b>Günü Kapat</b>'a tıklayınca biter.
              Bir sonraki satış otomatik olarak <b>yeni iş gününe</b> yazılır.
              Saatten bağımsızdır. 24/7 işletmeler için önerilir.
            </div>
          )}
        </div>

        {branches.length > 0 && (
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
            <div className="text-xs font-black text-slate-600 uppercase tracking-wide mb-2">Şube Bazında (override)</div>
            <div className="grid gap-3">
              {branches.map((b: any) => {
                const cur = branchOverrides[b.id] || { hour: null, mode: null };
                const effMode: DayMode = cur.mode || tenantMode;
                return (
                  <div key={b.id} className="rounded-lg bg-white border border-slate-200 p-2 grid gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-slate-700 text-sm flex-1 min-w-0 truncate">{b.name}</span>
                      <select
                        value={cur.mode || ''}
                        onChange={(e) => {
                          const v = e.target.value as '' | DayMode;
                          setBranchOverrides(prev => ({ ...prev, [b.id]: { ...(prev[b.id] || { hour: null, mode: null }), mode: v === '' ? null : v } }));
                        }}
                        disabled={!isOwnerOrAdmin}
                        className="px-2 py-1.5 rounded-lg border border-slate-200 bg-white font-bold text-slate-800 text-sm disabled:opacity-50"
                      >
                        <option value="">Mod: İşletme ({tenantMode === 'manual' ? 'Manuel' : 'Otomatik'})</option>
                        <option value="cutoff">Otomatik (cutoff)</option>
                        <option value="manual">Manuel (24/7)</option>
                      </select>
                    </div>
                    {effMode === 'cutoff' && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[11px] text-slate-500 font-bold">Başlangıç saati:</span>
                        <select
                          value={cur.hour === null || cur.hour === undefined ? '' : String(cur.hour)}
                          onChange={(e) => {
                            const v = e.target.value;
                            setBranchOverrides(prev => ({ ...prev, [b.id]: { ...(prev[b.id] || { hour: null, mode: null }), hour: v === '' ? null : parseInt(v, 10) } }));
                          }}
                          disabled={!isOwnerOrAdmin}
                          className="px-2 py-1.5 rounded-lg border border-slate-200 bg-white font-bold text-slate-800 text-sm disabled:opacity-50"
                        >
                          <option value="">İşletme varsayılanı ({String(tenantHour).padStart(2,'0')}:00)</option>
                          {HOURS_LIST.map(h => (
                            <option key={h} value={h}>{String(h).padStart(2,'0')}:00</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 justify-end">
          <button
            onClick={saveAll}
            disabled={saving || !isOwnerOrAdmin}
            className="px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-black text-sm disabled:opacity-50 inline-flex items-center gap-2"
          >
            {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            Kaydet
          </button>
        </div>
        {(error || ok) && (
          <div className={`text-sm rounded-lg px-3 py-2 ${error ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
            {error || ok}
          </div>
        )}
      </div>
    </div>
  );
}

// ===========================================================================
// Vardiya Tanimlari yonetimi (admin)
// ===========================================================================

interface ShiftDefinitionRow {
  id: string;
  tenant_id: string;
  branch_id: string;
  shift_no: number;
  name: string;
  start_time: string | null;
  end_time: string | null;
  color: string | null;
  is_active: boolean;
}

const SHIFT_DEF_COLORS = [
  { value: '#f97316', label: 'Turuncu' },
  { value: '#0ea5e9', label: 'Mavi' },
  { value: '#475569', label: 'Antrasit' },
  { value: '#10b981', label: 'Yeşil' },
  { value: '#a855f7', label: 'Mor' },
  { value: '#ef4444', label: 'Kırmızı' },
  { value: '#eab308', label: 'Sarı' },
  { value: '#06b6d4', label: 'Camgöbeği' },
];

function ShiftDefinitionsCard() {
  const { tenant, activeBranch, isOwnerOrAdmin, shiftsEnabled } = useAuth();
  const tenantId = tenant?.id || null;
  const branchId = activeBranch?.id || null;

  const [list, setList] = useState<ShiftDefinitionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const reload = async () => {
    if (!tenantId || !branchId) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: e } = await (supabase as any)
        .from('shift_definitions')
        .select('id, tenant_id, branch_id, shift_no, name, start_time, end_time, color, is_active')
        .eq('tenant_id', tenantId)
        .eq('branch_id', branchId)
        .order('shift_no', { ascending: true });
      if (e) throw e;
      setList(((data || []) as ShiftDefinitionRow[]));
    } catch (e: any) {
      setError(e?.message || 'Vardiya tanımları alınamadı');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, [tenantId, branchId]);

  const upsert = async (row: Partial<ShiftDefinitionRow> & { id?: string }) => {
    if (!tenantId || !branchId) return;
    setSavingId(row.id || 'new');
    setError(null);
    try {
      if (row.id) {
        const { error: e } = await (supabase as any)
          .from('shift_definitions')
          .update({
            name: row.name,
            shift_no: row.shift_no,
            start_time: row.start_time,
            end_time: row.end_time,
            color: row.color,
            is_active: row.is_active,
          })
          .eq('id', row.id);
        if (e) throw e;
      } else {
        const { error: e } = await (supabase as any)
          .from('shift_definitions')
          .insert({
            tenant_id: tenantId,
            branch_id: branchId,
            shift_no: row.shift_no,
            name: row.name,
            start_time: row.start_time || null,
            end_time: row.end_time || null,
            color: row.color || '#f97316',
            is_active: row.is_active ?? true,
          });
        if (e) throw e;
        setAdding(false);
      }
      await reload();
    } catch (e: any) {
      setError(e?.message || 'Kayıt başarısız');
    } finally {
      setSavingId(null);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Bu vardiya tanımını silmek istiyor musunuz? Mevcut açılmış vardiya kayıtları silinmez.')) return;
    setSavingId(id);
    setError(null);
    try {
      const { error: e } = await (supabase as any)
        .from('shift_definitions')
        .delete()
        .eq('id', id);
      if (e) throw e;
      await reload();
    } catch (e: any) {
      setError(e?.message || 'Silinemedi');
    } finally {
      setSavingId(null);
    }
  };

  const usedNos = new Set(list.map((d) => d.shift_no));
  const nextNo = (() => {
    for (let i = 1; i <= 9; i++) if (!usedNos.has(i)) return i;
    return 9;
  })();

  if (!shiftsEnabled) return null;

  return (
    <div className="bg-white border-2 border-gray-200 rounded-xl p-5">
      <div className="flex items-start gap-3 mb-4 flex-wrap">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-white flex items-center justify-center shadow shrink-0">
          <Clock className="w-6 h-6" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-bold text-gray-800">Vardiya Tanımları</h4>
          <p className="text-sm text-gray-500 mt-0.5">
            Şubenize özel vardiyalar (1–9 arası, esnek). Örn: <b>2 vardiya</b> (Gündüz/Gece), <b>3 vardiya</b> (Sabah/Öğle/Akşam) veya farklı kombinasyonlar.
            Kullanıcılara vardiya ataması yaparsanız giriş sonrası otomatik o vardiya seçili gelir.
          </p>
        </div>
        <button
          onClick={() => setAdding(true)}
          disabled={!isOwnerOrAdmin || adding || list.length >= 9}
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-sm font-bold shadow disabled:opacity-50"
        >
          <Plus className="w-4 h-4" /> Yeni
        </button>
      </div>

      {error && (
        <div className="mb-3 text-sm rounded-lg px-3 py-2 bg-rose-50 text-rose-700 border border-rose-200">{error}</div>
      )}

      {loading ? (
        <div className="text-sm text-slate-500 py-4 flex items-center gap-2"><RefreshCw className="w-4 h-4 animate-spin" /> Yükleniyor…</div>
      ) : (
        <div className="space-y-2">
          {list.length === 0 && !adding && (
            <div className="text-sm text-slate-400 italic py-4 text-center border border-dashed border-slate-200 rounded-lg">
              Tanımlı vardiya yok. <b>Yeni</b> ile bir vardiya ekleyin.
            </div>
          )}
          {list.map((row) => (
            <ShiftDefinitionEditor
              key={row.id}
              initial={row}
              disabled={!isOwnerOrAdmin}
              saving={savingId === row.id}
              onSave={(patch) => upsert({ ...row, ...patch })}
              onDelete={() => remove(row.id)}
            />
          ))}
          {adding && (
            <ShiftDefinitionEditor
              isNew
              initial={{ shift_no: nextNo, name: 'Yeni Vardiya', start_time: '', end_time: '', color: '#f97316', is_active: true }}
              disabled={!isOwnerOrAdmin}
              saving={savingId === 'new'}
              onSave={(patch) => upsert(patch)}
              onCancel={() => setAdding(false)}
            />
          )}
        </div>
      )}
    </div>
  );
}

function ShiftDefinitionEditor({
  initial,
  isNew,
  disabled,
  saving,
  onSave,
  onCancel,
  onDelete,
}: {
  initial: Partial<ShiftDefinitionRow>;
  isNew?: boolean;
  disabled?: boolean;
  saving?: boolean;
  onSave: (patch: Partial<ShiftDefinitionRow>) => void;
  onCancel?: () => void;
  onDelete?: () => void;
}) {
  const [shiftNo, setShiftNo] = useState<number>(initial.shift_no || 1);
  const [name, setName] = useState<string>(initial.name || '');
  const [startTime, setStartTime] = useState<string>((initial.start_time || '').slice(0, 5));
  const [endTime, setEndTime] = useState<string>((initial.end_time || '').slice(0, 5));
  const [color, setColor] = useState<string>(initial.color || '#f97316');
  const [isActive, setIsActive] = useState<boolean>(initial.is_active ?? true);

  return (
    <div className="border border-slate-200 rounded-xl p-3 bg-slate-50">
      <div className="grid grid-cols-12 gap-2 items-center">
        <div className="col-span-2 sm:col-span-1">
          <label className="text-[10px] font-black text-slate-500 uppercase">No</label>
          <input
            type="number" min={1} max={9}
            value={shiftNo}
            onChange={(e) => setShiftNo(Number(e.target.value) || 1)}
            disabled={disabled}
            className="w-full px-2 py-1.5 rounded-md border border-slate-200 text-sm font-black text-center"
          />
        </div>
        <div className="col-span-10 sm:col-span-4">
          <label className="text-[10px] font-black text-slate-500 uppercase">İsim</label>
          <input
            type="text" value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Sabah Vardiyası"
            disabled={disabled}
            className="w-full px-2 py-1.5 rounded-md border border-slate-200 text-sm"
          />
        </div>
        <div className="col-span-6 sm:col-span-2">
          <label className="text-[10px] font-black text-slate-500 uppercase">Başlangıç</label>
          <input
            type="time" value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            disabled={disabled}
            className="w-full px-2 py-1.5 rounded-md border border-slate-200 text-sm"
          />
        </div>
        <div className="col-span-6 sm:col-span-2">
          <label className="text-[10px] font-black text-slate-500 uppercase">Bitiş</label>
          <input
            type="time" value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            disabled={disabled}
            className="w-full px-2 py-1.5 rounded-md border border-slate-200 text-sm"
          />
        </div>
        <div className="col-span-8 sm:col-span-2">
          <label className="text-[10px] font-black text-slate-500 uppercase">Renk</label>
          <select
            value={color}
            onChange={(e) => setColor(e.target.value)}
            disabled={disabled}
            style={{ borderLeft: `8px solid ${color}` }}
            className="w-full px-2 py-1.5 rounded-md border border-slate-200 text-sm"
          >
            {SHIFT_DEF_COLORS.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>
        <div className="col-span-4 sm:col-span-1 flex items-end">
          <label className="inline-flex items-center gap-1.5 cursor-pointer text-xs font-bold text-slate-700 mt-4">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} disabled={disabled} className="w-4 h-4 accent-orange-600" />
            Aktif
          </label>
        </div>
      </div>
      <div className="flex items-center gap-2 mt-3 justify-end">
        {!isNew && onDelete && (
          <button
            onClick={onDelete}
            disabled={disabled || saving}
            className="px-3 py-1.5 rounded-md border border-rose-200 text-rose-600 hover:bg-rose-50 text-xs font-bold inline-flex items-center gap-1 disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5" /> Sil
          </button>
        )}
        {isNew && onCancel && (
          <button
            onClick={onCancel}
            disabled={saving}
            className="px-3 py-1.5 rounded-md text-slate-500 hover:bg-slate-100 text-xs font-bold"
          >
            İptal
          </button>
        )}
        <button
          onClick={() => onSave({
            shift_no: shiftNo,
            name: name.trim() || `Vardiya ${shiftNo}`,
            start_time: startTime || null,
            end_time: endTime || null,
            color,
            is_active: isActive,
          })}
          disabled={disabled || saving}
          className="px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black inline-flex items-center gap-1 shadow disabled:opacity-50"
        >
          {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          {isNew ? 'Ekle' : 'Kaydet'}
        </button>
      </div>
    </div>
  );
}
