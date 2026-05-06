import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { createClient } from '@supabase/supabase-js';
import { useAuth } from '../contexts/AuthContext';
import { Database } from '../lib/supabase';
import { X, Plus, Trash2, Settings as SettingsIcon, Building2, ToggleLeft, ToggleRight, Printer, AlertCircle, MapPin, Phone, Save, CreditCard as Edit2, User, Store, CheckCircle, Wifi, WifiOff, Globe, RefreshCw, Lock, ShieldCheck, Eye, EyeOff, Package, CheckSquare, Square, Database as DatabaseIcon, Receipt, Pencil, Scale, Loader } from 'lucide-react';
import { HuginSettings, loadHuginSettings, saveHuginSettings, testHuginConnection } from '../lib/huginTps';
import { Branch } from '../contexts/AuthContext';
import { PrinterSettings } from './PrinterSettings';
import { SqlServerSettings } from './SqlServerSettings';
import { DeviceManagement } from './DeviceManagement';
import { WaiterManagement } from './WaiterManagement';
import { ScaleCalibration } from './ScaleCalibration';

type TableGroup = Database['public']['Tables']['table_groups']['Row'];

interface SettingsProps {
  onClose: () => void;
}

export function Settings({ onClose }: SettingsProps) {
  const { tenant, profile, activeBranch, refreshProfile, refreshBranches } = useAuth();
  const [activeTab, setActiveTab] = useState<'tables' | 'products' | 'manage' | 'platforms' | 'branches' | 'printers' | 'account' | 'system' | 'security' | 'branch-products' | 'database' | 'hugin' | 'devices' | 'waiters' | 'scale'>('branches');
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
      .select('*, branches(id, name, is_main)')
      .eq('tenant_id', tenant.id);

    if (activeBranch) {
      query = query.eq('branch_id', activeBranch.id);
    }

    const { data } = await query.order('name');

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

    const { data, error } = await supabase
      .from('table_groups')
      .insert({
        tenant_id: tenant.id,
        branch_id: groupBranchId || activeBranch?.id || null,
        name: groupName,
        prefix: groupPrefix.toUpperCase(),
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
    { id: 'waiters', label: 'Garsonlar', icon: User, group: 'Yönetim' },
    { id: 'tables', label: 'Masa Grupları', icon: Store, group: 'Masalar' },
    { id: 'manage', label: 'Masa Düzenle', icon: SettingsIcon, group: 'Masalar' },
    { id: 'platforms', label: 'Online Platformlar', icon: Globe, group: 'Siparişler' },
    { id: 'printers', label: 'Yazıcılar', icon: Printer, group: 'Sistem' },
    { id: 'hugin', label: 'Yazarkasa (Hugin)', icon: Receipt, group: 'Sistem' },
    { id: 'scale', label: 'Terazi Testi', icon: Scale, group: 'Sistem' },
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
