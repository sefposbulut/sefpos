import { useState, useEffect } from 'react';
import { Server, Save, Eye, EyeOff, CheckCircle, AlertCircle, ArrowLeft, RefreshCw, X, Download } from 'lucide-react';

export interface SqlServerConfig {
  host: string;
  port: string;
  database: string;
  username: string;
  password: string;
  encrypt: boolean;
  trustServerCertificate: boolean;
}

interface Props {
  onSave?: (config: SqlServerConfig) => void;
  onBack?: () => void;
  onClose?: () => void;
  showBack?: boolean;
  inline?: boolean;
  /** Kurulum sihirbazından önerilen sunucu (ör. .\\SQLEXPRESS) */
  suggestedHost?: string;
}

const defaultConfig: SqlServerConfig = {
  host: '.\\SQLEXPRESS',
  port: '',
  database: 'sefpos45',
  username: 'sa',
  password: '',
  encrypt: false,
  trustServerCertificate: true,
};

function SqlServerForm({ onSave, onBack, onClose, showBack = true, inline = false, suggestedHost }: Props) {
  const [config, setConfig] = useState<SqlServerConfig>(() => ({
    ...defaultConfig,
    host: suggestedHost || defaultConfig.host,
  }));
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [importStatus, setImportStatus] = useState<'idle' | 'importing' | 'ok' | 'error'>('idle');
  const [importMessage, setImportMessage] = useState('');
  const [activeMode, setActiveMode] = useState<string | null>(null);
  const isPostgresMode = activeMode === 'postgres';
  const [companyName, setCompanyName] = useState('');
  const [companyAddress, setCompanyAddress] = useState('');
  const [companyPhone, setCompanyPhone] = useState('');
  const [companyEmail, setCompanyEmail] = useState('');
  const [licenseExpires, setLicenseExpires] = useState(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    return d.toISOString().slice(0, 10);
  });

  useEffect(() => {
    const api = (window as any).electronAPI;
    if (api?.getSqlServerConfig) {
      api.getSqlServerConfig().then((c: SqlServerConfig | null) => {
        if (c?.host) {
          setConfig({ ...defaultConfig, ...c });
        } else if (suggestedHost) {
          setConfig((prev) => ({ ...prev, host: suggestedHost }));
        }
        setLoading(false);
      });
    } else {
      setLoading(false);
    }
    if (api?.getDbMode) {
      api.getDbMode().then((mode: string | null) => setActiveMode(mode));
    }
  }, [suggestedHost]);

  const handleChange = (field: keyof SqlServerConfig, value: string | boolean) => {
    setConfig(prev => ({ ...prev, [field]: value }));
    setSaved(false);
    setTestStatus('idle');
  };

  const saveCompanyProfile = async () => {
    const api = (window as any).electronAPI;
    if (!api?.sqlUpdateTenantProfile || !companyName.trim()) return;
    let tenantId = '';
    let branchId = '';
    try {
      const s = localStorage.getItem('shefpos_sql_session');
      if (s) {
        const rec = JSON.parse(s)?._sqlRecord;
        tenantId = rec?.tenant_id || '';
        branchId = rec?.branch_id || '';
      }
    } catch { /* ignore */ }
    if (!tenantId && api.sqlLogin) {
      const lr = await api.sqlLogin({ email: 'admin@shefpos.local', password: '1234' });
      if (lr?.success && lr.data) {
        tenantId = lr.data.tenant_id;
        branchId = lr.data.branch_id;
      }
    }
    if (!tenantId) return;
    await api.sqlUpdateTenantProfile({
      tenantId,
      branchId: branchId || undefined,
      name: companyName.trim(),
      address: companyAddress.trim() || null,
      phone: companyPhone.trim() || null,
      email: companyEmail.trim() || null,
      branchName: companyName.trim(),
      subscription_expires_at: licenseExpires || null,
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const api = (window as any).electronAPI;
      if (api?.setSqlServerConfig) {
        await api.setSqlServerConfig(config);
      }
      if (api?.setDbMode) {
        const targetMode = isPostgresMode ? 'postgres' : 'sqlserver';
        await api.setDbMode(targetMode);
        setActiveMode(targetMode);
      }
      if (companyName.trim()) {
        await saveCompanyProfile();
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      onSave?.(config);
      const api2 = (window as any).electronAPI;
      if (api2?.sqlHealthCheck && !isPostgresMode) {
        const health = await api2.sqlHealthCheck(config);
        if (health?.success && !health.ok && health.missing?.length) {
          setImportStatus('error');
          setImportMessage(
            `Bağlantı kaydedildi; eksik tablolar: ${health.missing.join(', ')}. «Eksik tabloları güncelle» ile patch uygulayın.`,
          );
        }
      }
    } finally {
      setSaving(false);
    }
  };

  const handleImport = async () => {
    if (!config.host || !config.username) {
      setImportStatus('error');
      setImportMessage('Sunucu ve kullanıcı adı zorunludur.');
      return;
    }
    if (!(window as any).electronAPI?.importSqlServerSchema) {
      setImportStatus('error');
      setImportMessage('Veritabanı kurulumu yalnızca ŞefPOS masaüstü (Electron) uygulamasında çalışır. Tarayıcıdan değil, kurulu Sefpos.exe ile açın.');
      return;
    }
    setImportStatus('importing');
    setImportMessage('Veritabanı oluşturuluyor, bu işlem 1–3 dakika sürebilir…');
    const api = (window as any).electronAPI;
    if (api?.setSqlServerConfig) {
      try {
        await api.setSqlServerConfig(config);
      } catch { /* ignore */ }
    }
    if (isPostgresMode) {
      if (!api?.postgresInitDatabase) {
        setImportStatus('error');
        setImportMessage('PostgreSQL kurulum özelliği bu sürümde yok.');
        return;
      }
      const result = await api.postgresInitDatabase(config);
      if (result.success) {
        setImportStatus('ok');
        setImportMessage(result.output || 'PostgreSQL veritabanı hazırlandı.');
      } else {
        setImportStatus('error');
        setImportMessage(result.error || 'Kurulum başarısız oldu.');
      }
      return;
    }

    if (!api?.importSqlServerSchema) {
      setImportStatus('error');
      setImportMessage('Bu özellik sadece Electron uygulamasında çalışır.');
      return;
    }
    const result = await Promise.race([
      api.importSqlServerSchema(config),
      new Promise<{ success: false; error: string }>((resolve) =>
        window.setTimeout(
          () => resolve({ success: false, error: 'Kurulum zaman aşımı (3 dk). SQL Server yanıt vermiyor olabilir.' }),
          180_000,
        ),
      ),
    ]);
    if (result.success) {
      setImportStatus('ok');
      const hostHint = (result as { resolvedHost?: string }).resolvedHost
        ? ` Bağlanılan: ${(result as { resolvedHost?: string }).resolvedHost}`
        : '';
      setImportMessage(
        (result.output ||
          'sefpos45 hazır. Giriş: kullanıcı adı ADMIN veya admin, şifre 1234') + hostHint,
      );
    } else {
      setImportStatus('error');
      setImportMessage(result.error || 'Import başarısız oldu.');
    }
  };

  const handleTest = async () => {
    if (!config.host || !config.username) {
      setTestStatus('error');
      setTestMessage('Sunucu ve kullanıcı adı zorunludur.');
      return;
    }
    setTestStatus('testing');
    setTestMessage('');
    const api = (window as any).electronAPI;
    const testFn = isPostgresMode ? api?.postgresTestConnection : api?.sqlTestConnection;
    if (!testFn) {
      setTestStatus('error');
      setTestMessage('Bu özellik sadece Electron uygulamasında çalışır.');
      return;
    }
    const timeoutMs = 18_000;
    const result = await Promise.race([
      testFn(config),
      new Promise<{ success: false; error: string }>((resolve) =>
        window.setTimeout(
          () =>
            resolve({
              success: false,
              error:
                'Bağlantı zaman aşımı (18 sn). SQL Server 2008 için Şifrele kapalı olsun; isimli örnek için Sunucu: .\\SQLEXPRESS (Port boş). SQL Browser servisi çalışıyor mu?',
            }),
          timeoutMs,
        ),
      ),
    ]);
    if (result.success) {
      setTestStatus('ok');
      const extra = (result as { sqlVersion?: string }).sqlVersion
        ? ` Sürüm: ${(result as { sqlVersion?: string }).sqlVersion}`
        : '';
      const hostHint = (result as { resolvedHost?: string }).resolvedHost
        ? ` Bağlanılan adres: ${(result as { resolvedHost?: string }).resolvedHost}.`
        : '';
      setTestMessage(
        isPostgresMode
          ? 'PostgreSQL bağlantısı başarılı.'
          : `SQL Server bağlantısı başarılı.${extra}${hostHint} Sonra «sefpos45 Veritabanını Kur» ile şemayı yükleyin.`,
      );
    } else {
      setTestStatus('error');
      setTestMessage(result.error || 'Bağlantı başarısız');
    }
  };

  const handleApplyPatches = async () => {
    const api = (window as any).electronAPI;
    if (!api?.sqlApplySchemaPatches) {
      setImportStatus('error');
      setImportMessage('Patch yalnızca Electron Sefpos.exe içinde çalışır.');
      return;
    }
    setImportStatus('importing');
    setImportMessage('Eksik tablolar ekleniyor (waiter_calls, print_settings)…');
    const result = await api.sqlApplySchemaPatches(config);
    if (result.success) {
      setImportStatus('ok');
      setImportMessage(result.output || 'Patch tamamlandı. Uygulamayı yeniden başlatın.');
    } else {
      setImportStatus('error');
      setImportMessage(result.error || 'Patch başarısız.');
    }
  };

  const handleTestAndSetup = async () => {
    if (isPostgresMode) {
      await handleTest();
      return;
    }
    if (!config.host || !config.username) {
      setTestStatus('error');
      setTestMessage('Sunucu ve kullanıcı adı zorunludur.');
      return;
    }
    setTestStatus('testing');
    setTestMessage('');
    setImportStatus('idle');
    const api = (window as any).electronAPI;
    if (!api?.sqlTestConnection || !api?.importSqlServerSchema) {
      setTestStatus('error');
      setTestMessage('Bu özellik yalnızca Sefpos.exe içinde çalışır.');
      return;
    }
    const result = await Promise.race([
      api.sqlTestConnection(config),
      new Promise<{ success: false; error: string }>((resolve) =>
        window.setTimeout(
          () => resolve({ success: false, error: 'Bağlantı zaman aşımı (18 sn).' }),
          18_000,
        ),
      ),
    ]);
    if (!result.success) {
      setTestStatus('error');
      setTestMessage(result.error || 'Bağlantı başarısız');
      return;
    }
    setTestStatus('ok');
    setTestMessage('Bağlantı OK. Veritabanı kuruluyor…');
    if (api?.setSqlServerConfig) await api.setSqlServerConfig(config);

    setImportStatus('importing');
    setImportMessage('Veritabanı oluşturuluyor, bu işlem 1–3 dakika sürebilir…');
    const importResult = await Promise.race([
      api.importSqlServerSchema(config),
      new Promise<{ success: false; error: string }>((resolve) =>
        window.setTimeout(
          () => resolve({ success: false, error: 'Kurulum zaman aşımı (3 dk).' }),
          180_000,
        ),
      ),
    ]);
    if (!importResult.success) {
      setImportStatus('error');
      setImportMessage(importResult.error || 'Kurulum başarısız.');
      return;
    }
    setImportStatus('ok');
    const hostHint = (importResult as { resolvedHost?: string }).resolvedHost
      ? ` Bağlanılan: ${(importResult as { resolvedHost?: string }).resolvedHost}`
      : '';

    let loginHint = '';
    if (api?.sqlLogin) {
      const loginCheck = await api.sqlLogin({ email: 'admin@shefpos.local', password: '1234' });
      if (!loginCheck?.success) {
        setImportStatus('error');
        setImportMessage(
          `Veritabanı kuruldu ancak ADMIN girişi doğrulanamadı: ${loginCheck?.error || 'bilinmeyen hata'}. «Test Et + Kur ve Başla»yı tekrar deneyin.`,
        );
        return;
      }
      loginHint = ' Giriş doğrulandı: ADMIN / 1234';
    }

    setImportMessage(
      (importResult.output ||
        'sefpos45 hazır. Giriş: ADMIN / 1234') + hostHint + loginHint,
    );

    try {
      if (api?.setDbMode) {
        await api.setDbMode('sqlserver');
        localStorage.setItem('dbMode', 'sqlserver');
        setActiveMode('sqlserver');
      }
      if (companyName.trim()) await saveCompanyProfile();
      setSaved(true);
      onSave?.(config);
    } catch {
      /* kayıt hatası import sonrası ayrı gösterilmez */
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500" />
      </div>
    );
  }

  const inputCls = inline
    ? 'w-full bg-gray-50 border-2 border-gray-200 focus:border-emerald-500 rounded-lg px-3 py-2.5 text-gray-800 placeholder-gray-400 text-sm outline-none transition-colors'
    : 'w-full bg-white/5 border border-white/10 focus:border-emerald-500/60 rounded-lg px-3 py-2.5 text-white placeholder-slate-500 text-sm outline-none transition-colors';

  const labelCls = inline ? 'block text-sm font-medium text-gray-700 mb-1.5' : 'block text-sm font-medium text-slate-300 mb-1.5';
  const toggleOffCls = inline ? 'bg-gray-200' : 'bg-white/20';
  const toggleTextCls = inline ? 'text-sm text-gray-700' : 'text-sm text-slate-300';

  return (
    <div className={inline ? '' : 'w-full max-w-lg'}>
      {(activeMode === 'sqlserver' || activeMode === 'postgres') && (
        <div className={`flex items-center gap-3 rounded-xl px-4 py-3 mb-4 ${inline ? 'bg-emerald-50 border-2 border-emerald-200' : 'bg-emerald-500/15 border border-emerald-500/30'}`}>
          <div className={`w-2.5 h-2.5 rounded-full animate-pulse flex-shrink-0 ${inline ? 'bg-emerald-500' : 'bg-emerald-400'}`} />
          <div>
            <p className={`text-sm font-bold ${inline ? 'text-emerald-800' : 'text-emerald-300'}`}>{isPostgresMode ? 'PostgreSQL Modu Aktif' : 'SQL Server Modu Aktif'}</p>
            <p className={`text-xs ${inline ? 'text-emerald-600' : 'text-emerald-400/80'}`}>{isPostgresMode ? 'Bu sistem yerel PostgreSQL veritabanına bağlı olarak çalışıyor.' : 'Bu sistem yerel SQL Server veritabanına bağlı olarak çalışıyor.'}</p>
          </div>
        </div>
      )}
      {!inline && (
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            {showBack && onBack && (
              <button
                onClick={onBack}
                className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <div className="w-10 h-10 bg-emerald-500/20 rounded-xl flex items-center justify-center">
              <Server className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">{isPostgresMode ? 'PostgreSQL Ayarları' : 'SQL Server Ayarları'}</h1>
              <p className="text-slate-400 text-sm">Yerel veritabanı bağlantı bilgileri</p>
            </div>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      )}

      {inline && (
        <div className="flex items-center gap-2 mb-5">
          <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center">
            <Server className="w-4 h-4 text-emerald-600" />
          </div>
          <div>
            <h4 className="font-bold text-gray-800 text-sm">{isPostgresMode ? 'PostgreSQL Bağlantısı' : 'SQL Server Bağlantısı'}</h4>
            <p className="text-xs text-gray-500">Yerel veritabanı bağlantı bilgileri</p>
          </div>
        </div>
      )}

      {typeof window !== 'undefined' && !(window as any).electronAPI?.sqlTestConnection && (
        <div className={`rounded-xl px-4 py-3 mb-4 text-sm ${inline ? 'bg-red-50 border-2 border-red-200 text-red-800' : 'bg-red-500/15 border border-red-500/40 text-red-200'}`}>
          <strong>ŞefPOS masaüstü değil.</strong> «Veritabanı Ayarları / Online-Offline» ekranı başka programdır.
          Kurulu <strong>Sefpos.exe</strong> ile açın; yeşil «SQL Server Ayarları» ve «Test Et» butonları görünmeli.
        </div>
      )}

      <div className={inline ? 'space-y-4' : 'bg-white/5 border border-white/10 rounded-2xl p-6 space-y-5'}>
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2">
            <label className={labelCls}>Sunucu / Host</label>
            <input
              type="text"
              value={config.host}
              onChange={e => handleChange('host', e.target.value)}
              placeholder={isPostgresMode ? 'localhost' : '.\\SQLEXPRESS veya localhost\\SQLEXPRESS'}
              className={inputCls}
            />
            {!isPostgresMode && (
              <p className={`text-xs mt-1 ${inline ? 'text-gray-500' : 'text-slate-500'}`}>
                İsimli örnek: <code>.\SQLEXPRESS</code> — Port genelde boş. Özel kurulum: <code>.\INSTANCEADINIZ</code>
              </p>
            )}
          </div>
          <div>
            <label className={labelCls}>Port</label>
            <input
              type="text"
              value={config.port}
              onChange={e => handleChange('port', e.target.value)}
              placeholder={isPostgresMode ? '5432' : 'boş (Express)'}
              className={inputCls}
            />
          </div>
        </div>

        <div>
          <label className={labelCls}>Veritabanı Adı</label>
          <input
            type="text"
            value={config.database}
            onChange={e => handleChange('database', e.target.value)}
            placeholder="sefpos45"
            className={inputCls}
          />
        </div>

        <div>
          <label className={labelCls}>Kullanıcı Adı</label>
          <input
            type="text"
            value={config.username}
            onChange={e => handleChange('username', e.target.value)}
            placeholder={isPostgresMode ? 'postgres' : 'sa'}
            autoComplete="off"
            className={inputCls}
          />
        </div>

        <div>
          <label className={labelCls}>Şifre</label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={config.password}
              onChange={e => handleChange('password', e.target.value)}
              placeholder="••••••••"
              autoComplete="new-password"
              className={`${inputCls} pr-10`}
            />
            <button
              type="button"
              onClick={() => setShowPassword(p => !p)}
              className={`absolute right-3 top-1/2 -translate-y-1/2 transition-colors ${inline ? 'text-gray-400 hover:text-gray-600' : 'text-slate-400 hover:text-white'}`}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div className="space-y-3 pt-1">
          <label className="flex items-center gap-3 cursor-pointer">
            <div
              onClick={() => handleChange('encrypt', !config.encrypt)}
              className={`w-10 h-5 rounded-full transition-colors relative flex-shrink-0 ${config.encrypt ? 'bg-emerald-500' : toggleOffCls}`}
            >
              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${config.encrypt ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </div>
            <span className={toggleTextCls}>Bağlantıyı Şifrele (Encrypt)</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <div
              onClick={() => handleChange('trustServerCertificate', !config.trustServerCertificate)}
              className={`w-10 h-5 rounded-full transition-colors relative flex-shrink-0 ${config.trustServerCertificate ? 'bg-emerald-500' : toggleOffCls}`}
            >
              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${config.trustServerCertificate ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </div>
            <span className={toggleTextCls}>Sunucu Sertifikasına Güven</span>
          </label>
        </div>

        {testStatus !== 'idle' && (
          <div className={`flex items-start gap-3 p-3 rounded-lg text-sm ${
            testStatus === 'testing' ? 'bg-blue-50 text-blue-700' :
            testStatus === 'ok' ? 'bg-emerald-50 text-emerald-700' :
            'bg-red-50 text-red-700'
          }`}>
            {testStatus === 'testing' && <RefreshCw className="w-4 h-4 mt-0.5 animate-spin flex-shrink-0" />}
            {testStatus === 'ok' && <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />}
            {testStatus === 'error' && <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />}
            <span>{testStatus === 'testing' ? 'Bağlantı test ediliyor...' : testMessage}</span>
          </div>
        )}
      </div>

      <div className={`rounded-xl p-4 space-y-3 ${inline ? 'bg-amber-50 border-2 border-amber-200' : 'bg-white/5 border border-white/10'}`}>
        <p className={`text-xs font-bold uppercase tracking-wide ${inline ? 'text-amber-800' : 'text-amber-200'}`}>
          İşletme ve lisans (SQL Server)
        </p>
        <p className={`text-xs ${inline ? 'text-slate-600' : 'text-slate-400'}`}>
          Firma bilgileri yerel veritabanına yazılır; lisans bitiş tarihine göre sistem çalışır (internet gerekmez).
        </p>
        <input
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          placeholder="Firma / restoran adı *"
          className="w-full rounded-lg border px-3 py-2 text-sm"
        />
        <input
          value={companyAddress}
          onChange={(e) => setCompanyAddress(e.target.value)}
          placeholder="Adres"
          className="w-full rounded-lg border px-3 py-2 text-sm"
        />
        <div className="grid grid-cols-2 gap-2">
          <input
            value={companyPhone}
            onChange={(e) => setCompanyPhone(e.target.value)}
            placeholder="Telefon"
            className="rounded-lg border px-3 py-2 text-sm"
          />
          <input
            value={companyEmail}
            onChange={(e) => setCompanyEmail(e.target.value)}
            placeholder="E-posta"
            className="rounded-lg border px-3 py-2 text-sm"
          />
        </div>
        <label className={`text-xs font-medium ${inline ? 'text-slate-600' : 'text-slate-300'}`}>
          Lisans bitiş tarihi
          <input
            type="date"
            value={licenseExpires}
            onChange={(e) => setLicenseExpires(e.target.value)}
            className="mt-1 w-full rounded-lg border px-3 py-2 text-sm block"
          />
        </label>
      </div>

      <div className={`flex gap-3 ${inline ? 'mt-4' : 'mt-5'}`}>
        <button
          onClick={handleTest}
          disabled={testStatus === 'testing'}
          className={`flex-1 flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-medium transition-all disabled:opacity-50 ${
            inline
              ? 'bg-gray-100 hover:bg-gray-200 text-gray-700 border-2 border-gray-200'
              : 'bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-slate-300 hover:text-white'
          }`}
        >
          <RefreshCw className={`w-4 h-4 ${testStatus === 'testing' ? 'animate-spin' : ''}`} />
          Test Et
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl py-3 text-sm font-bold transition-all disabled:opacity-60"
        >
          {saved ? (
            <><CheckCircle className="w-4 h-4" /> Kaydedildi</>
          ) : saving ? (
            <><RefreshCw className="w-4 h-4 animate-spin" /> Kaydediliyor...</>
          ) : (
            <><Save className="w-4 h-4" /> Kaydet</>
          )}
        </button>
      </div>

      {!!(window as any).electronAPI && (
        <div className={`mt-4 space-y-3 ${inline ? '' : ''}`}>
          <div className={`rounded-xl p-4 ${inline ? 'bg-slate-50 border-2 border-slate-200' : 'bg-white/5 border border-white/10'}`}>
            <p className={`text-xs font-bold uppercase tracking-wide mb-1 ${inline ? 'text-slate-500' : 'text-slate-400'}`}>
              Otomatik Kurulum
            </p>
          <p className={`text-xs mb-3 ${inline ? 'text-slate-600' : 'text-slate-400'}`}>
              <strong>Kur ve Başla</strong> ile test, veritabanı, patch ve kayıt tek adımda yapılır. Giriş: <strong>ADMIN</strong> / <strong>1234</strong>
            </p>

            {importStatus !== 'idle' && (
              <div className={`flex items-start gap-2 p-2.5 rounded-lg text-xs mb-3 ${
                importStatus === 'importing' ? 'bg-blue-50 text-blue-700' :
                importStatus === 'ok' ? 'bg-emerald-50 text-emerald-700' :
                'bg-red-50 text-red-700'
              }`}>
                {importStatus === 'importing' && <RefreshCw className="w-3.5 h-3.5 mt-0.5 animate-spin flex-shrink-0" />}
                {importStatus === 'ok' && <CheckCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />}
                {importStatus === 'error' && <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />}
                <span>{importStatus === 'importing' ? 'Veritabanı oluşturuluyor ve şema import ediliyor...' : importMessage}</span>
              </div>
            )}

            <button
              onClick={handleImport}
              disabled={importStatus === 'importing' || testStatus === 'testing'}
              className={`w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold transition-all disabled:opacity-50 ${
                inline
                  ? 'bg-slate-800 hover:bg-slate-700 text-white'
                  : 'bg-white/10 hover:bg-white/20 text-white'
              }`}
            >
              <Download className={`w-4 h-4 ${importStatus === 'importing' ? 'animate-bounce' : ''}`} />
              {importStatus === 'importing' ? 'Kuruluyor...' : 'sefpos45 Veritabanını Kur'}
            </button>
            <button
              type="button"
              onClick={() => void handleTestAndSetup()}
              disabled={importStatus === 'importing' || testStatus === 'testing'}
              className={`w-full mt-2 flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition-all disabled:opacity-50 ${
                inline
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                  : 'bg-emerald-600/90 hover:bg-emerald-500 text-white'
              }`}
            >
              Test Et + Kur ve Başla
            </button>
            <button
              type="button"
              onClick={() => void handleApplyPatches()}
              disabled={importStatus === 'importing'}
              className={`w-full mt-2 flex items-center justify-center gap-2 rounded-xl py-2 text-sm font-medium transition-all disabled:opacity-50 ${
                inline ? 'bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300' : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40'
              }`}
            >
              Eksik tabloları güncelle (garson çağrı / yazıcı ayarı)
            </button>
            <p className={`text-xs mt-2 ${inline ? 'text-slate-600' : 'text-slate-400'}`}>
              Varsayılan kasa girişi: <strong>ADMIN</strong> / <strong>1234</strong> (kurulumdan sonra)
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export function SqlServerSettings(props: Props) {
  if (props.inline) {
    return <SqlServerForm {...props} />;
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6" style={{ background: 'linear-gradient(160deg, #0f172a 0%, #1e3a5f 55%, #0f2744 100%)' }}>
      <SqlServerForm {...props} />
    </div>
  );
}
