import { useState, useCallback } from 'react';
import { Monitor, LogOut, RefreshCw, Delete, AlertCircle, Wifi, User, ChevronRight, KeyRound, Eye, EyeOff } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { TableGrid } from './TableGrid';
import { OrderPanel } from './OrderPanel';
import { warmOrderItemsForPanel } from '../lib/orderPanelWarm';
import { Database } from '../lib/supabase';
type Table = Database['public']['Tables']['restaurant_tables']['Row'];

const TERMINAL_STORAGE = 'shefpos_terminal_mode';
const TERMINAL_SQL_CONFIG = 'shefpos_terminal_sql_config';
const TERMINAL_SESSION = 'shefpos_terminal_session';

export function isTerminalMode(): boolean {
  return localStorage.getItem(TERMINAL_STORAGE) === 'true';
}

export function exitTerminalMode() {
  localStorage.removeItem(TERMINAL_STORAGE);
  localStorage.removeItem(TERMINAL_SESSION);
}

interface TerminalConfig {
  host: string;
  port: string;
  database: string;
  username: string;
  password: string;
}

interface TerminalUser {
  id: string;
  full_name: string;
  username: string;
  role: string;
  branch_id: string | null;
}

interface TerminalLoginProps {
  onBack: () => void;
  onConnected: () => void;
}

function NumpadKey({ label, sub, onPress }: { label: string; sub?: string; onPress: () => void }) {
  return (
    <button
      type="button"
      onPointerDown={(e) => { e.preventDefault(); onPress(); }}
      className="flex flex-col items-center justify-center rounded-2xl bg-white/10 hover:bg-white/20 active:bg-white/30 transition-all select-none"
      style={{ minHeight: 64, touchAction: 'manipulation' }}
    >
      <span className="text-white text-xl font-semibold leading-none">{label}</span>
      {sub && <span className="text-white/50 text-[10px] mt-0.5 tracking-widest">{sub}</span>}
    </button>
  );
}

function NumpadBackspace({ onPress }: { onPress: () => void }) {
  return (
    <button
      type="button"
      onPointerDown={(e) => { e.preventDefault(); onPress(); }}
      className="flex items-center justify-center rounded-2xl bg-white/10 hover:bg-white/20 active:bg-white/30 transition-all select-none"
      style={{ minHeight: 64, touchAction: 'manipulation' }}
    >
      <Delete className="w-5 h-5 text-white/80" />
    </button>
  );
}

const numpadRows = [
  [{ d: '1', s: '' }, { d: '2', s: 'ABC' }, { d: '3', s: 'DEF' }],
  [{ d: '4', s: 'GHI' }, { d: '5', s: 'JKL' }, { d: '6', s: 'MNO' }],
  [{ d: '7', s: 'PQRS' }, { d: '8', s: 'TUV' }, { d: '9', s: 'WXYZ' }],
];

const roleLabel: Record<string, string> = {
  owner: 'Sahip',
  admin: 'Yönetici',
  manager: 'Müdür',
  cashier: 'Kasiyer',
  waiter: 'Garson',
};

const roleColor: Record<string, string> = {
  owner: 'bg-amber-500/20 text-amber-300',
  admin: 'bg-blue-500/20 text-blue-300',
  manager: 'bg-cyan-500/20 text-cyan-300',
  cashier: 'bg-emerald-500/20 text-emerald-300',
  waiter: 'bg-slate-500/20 text-slate-300',
};

export function TerminalLogin({ onBack, onConnected }: TerminalLoginProps) {
  const isElectron = !!(window as any).electronAPI;
  const [step, setStep] = useState<'config' | 'userlist' | 'pin' | 'manual'>('config');
  const [config, setConfig] = useState<TerminalConfig>(() => {
    try {
      const saved = localStorage.getItem(TERMINAL_SQL_CONFIG);
      return saved ? JSON.parse(saved) : { host: 'localhost', port: '1433', database: 'sefpos45', username: 'sa', password: '1578' };
    } catch { return { host: 'localhost', port: '1433', database: 'sefpos45', username: 'sa', password: '1578' }; }
  });
  const [users, setUsers] = useState<TerminalUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<TerminalUser | null>(null);
  const [pinValue, setPinValue] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [manualUsername, setManualUsername] = useState('');
  const [manualPassword, setManualPassword] = useState('');
  const [showManualPassword, setShowManualPassword] = useState(false);

  const bg = 'linear-gradient(160deg, #0a1628 0%, #0f2744 50%, #0a1628 100%)';

  const handleTestAndContinue = async () => {
    if (!config.host || !config.username) { setError('Sunucu adresi ve kullanıcı adı gerekli'); return; }
    setLoading(true);
    setError('');
    if (isElectron) {
      const api = (window as any).electronAPI;
      const result = await api.sqlTestConnection({
        ...config,
        database: config.database || 'sefpos45',
        encrypt: false,
        trustServerCertificate: true,
      });
      setLoading(false);
      if (result.success) {
        await api.setSqlServerConfig({ ...config, database: config.database || 'sefpos45', encrypt: false, trustServerCertificate: true });
        localStorage.setItem('dbMode', 'sqlserver');
        localStorage.setItem(TERMINAL_SQL_CONFIG, JSON.stringify(config));
        loadUsers(api);
      } else {
        setError('Bağlantı başarısız: ' + (result.error || 'Bilinmeyen hata'));
      }
    } else {
      setLoading(false);
      localStorage.setItem(TERMINAL_SQL_CONFIG, JSON.stringify(config));
      setStep('userlist');
    }
  };

  const loadUsers = async (api: any) => {
    setLoadingUsers(true);
    try {
      const result = await api.sqlGetTerminalUsers?.();
      if (result?.data && result.data.length > 0) {
        setUsers(result.data as TerminalUser[]);
        setStep('userlist');
      } else {
        setStep('userlist');
        setUsers([]);
      }
    } catch {
      setStep('userlist');
      setUsers([]);
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleSelectUser = (u: TerminalUser) => {
    setSelectedUser(u);
    setPinValue('');
    setError('');
    setStep('pin');
  };

  const handlePinKey = useCallback((digit: string) => {
    setPinValue(p => p + digit);
  }, []);

  const handlePinDelete = useCallback(() => {
    setPinValue(p => p.slice(0, -1));
  }, []);

  const handlePinLogin = async () => {
    if (!selectedUser || !pinValue) return;
    setError('');
    setLoading(true);
    try {
      const api = isElectron ? (window as any).electronAPI : null;
      const username = selectedUser.username || selectedUser.full_name;
      const email = username.includes('@') ? username.toLowerCase() : `${username.toLowerCase()}@shefpos.local`;

      if (api?.sqlLogin) {
        const result = await api.sqlLogin({ email, password: pinValue });
        if (!result.success) {
          setError(result.error?.includes('bulunamadi') ? 'Kullanici bulunamadi' : result.error?.includes('hatali') ? 'Sifre hatali' : (result.error || 'Giris basarisiz'));
          setPinValue('');
          setLoading(false);
          return;
        }
        localStorage.setItem(TERMINAL_SESSION, JSON.stringify(result.data));
        localStorage.setItem(TERMINAL_STORAGE, 'true');
        const sqlSession = {
          access_token: `sqlserver-${result.data.user_id}`,
          refresh_token: null,
          expires_in: 86400,
          token_type: 'bearer',
          user: {
            id: result.data.user_id,
            email: result.data.email,
            app_metadata: {},
            user_metadata: { full_name: result.data.full_name },
            aud: 'authenticated',
            created_at: new Date().toISOString(),
          },
          _sqlRecord: result.data,
        };
        localStorage.setItem('shefpos_sql_session', JSON.stringify(sqlSession));
        onConnected();
      } else {
        const { error: authError } = await supabase.auth.signInWithPassword({ email, password: pinValue });
        if (authError) {
          setError('Giris basarisiz: ' + authError.message);
          setPinValue('');
          setLoading(false);
          return;
        }
        localStorage.setItem(TERMINAL_STORAGE, 'true');
        onConnected();
      }
    } catch (err: any) {
      setError(err.message || 'Bir hata olustu');
      setPinValue('');
    } finally {
      setLoading(false);
    }
  };

  const handleManualLogin = async () => {
    if (!manualUsername.trim() || !manualPassword) return;
    setError('');
    setLoading(true);
    try {
      const api = isElectron ? (window as any).electronAPI : null;
      const uname = manualUsername.trim();
      const email = uname.includes('@') ? uname.toLowerCase() : `${uname.toLowerCase().replace(/[^a-z0-9]/g, '')}@shefpos.local`;

      if (api?.sqlLogin) {
        const result = await api.sqlLogin({ email, password: manualPassword });
        if (!result.success) {
          setError(result.error || 'Giriş başarısız');
          setLoading(false);
          return;
        }
        localStorage.setItem(TERMINAL_SESSION, JSON.stringify(result.data));
        localStorage.setItem(TERMINAL_STORAGE, 'true');
        const sqlSession = {
          access_token: `sqlserver-${result.data.user_id}`,
          refresh_token: null,
          expires_in: 86400,
          token_type: 'bearer',
          user: {
            id: result.data.user_id,
            email: result.data.email,
            app_metadata: {},
            user_metadata: { full_name: result.data.full_name },
            aud: 'authenticated',
            created_at: new Date().toISOString(),
          },
          _sqlRecord: result.data,
        };
        localStorage.setItem('shefpos_sql_session', JSON.stringify(sqlSession));
        onConnected();
      } else {
        const { error: authError } = await supabase.auth.signInWithPassword({ email, password: manualPassword });
        if (authError) {
          setError('Giriş başarısız: ' + authError.message);
          setLoading(false);
          return;
        }
        localStorage.setItem(TERMINAL_STORAGE, 'true');
        onConnected();
      }
    } catch (err: any) {
      setError(err.message || 'Bir hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  if (step === 'config') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6" style={{ background: bg }}>
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-cyan-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Monitor className="w-8 h-8 text-cyan-400" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">Terminal Modu</h1>
            <p className="text-slate-400 text-sm">Ana kasanın SQL Server bilgilerini girin</p>
            <div className="mt-3 flex items-center gap-2 bg-cyan-500/10 border border-cyan-500/20 rounded-xl px-4 py-2.5 text-cyan-300 text-xs text-left">
              <Wifi className="w-4 h-4 flex-shrink-0 text-cyan-400" />
              <span>Bu bilgisayara SQL Server kurulu olması <span className="font-bold text-white">gerekmez</span>. Sadece ana kasanın IP adresi ve şifresi yeterlidir.</span>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 mb-4 text-red-300 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4 mb-5">
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Sunucu Adresi</label>
                <input
                  type="text" value={config.host}
                  onChange={e => setConfig({ ...config, host: e.target.value })}
                  placeholder="192.168.1.100"
                  className="w-full bg-white/5 border border-white/10 focus:border-cyan-500/60 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 text-sm outline-none transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Port</label>
                <input
                  type="text" value={config.port}
                  onChange={e => setConfig({ ...config, port: e.target.value })}
                  placeholder="1433"
                  className="w-full bg-white/5 border border-white/10 focus:border-cyan-500/60 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 text-sm outline-none transition-colors"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Veritabani Adi</label>
              <input
                type="text" value={config.database}
                onChange={e => setConfig({ ...config, database: e.target.value })}
                placeholder="sefpos45"
                className="w-full bg-white/5 border border-white/10 focus:border-cyan-500/60 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 text-sm outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">SA Kullanici Adi</label>
              <input
                type="text" value={config.username}
                onChange={e => setConfig({ ...config, username: e.target.value })}
                placeholder="sa"
                className="w-full bg-white/5 border border-white/10 focus:border-cyan-500/60 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 text-sm outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">SA Sifresi</label>
              <input
                type="password" value={config.password}
                onChange={e => setConfig({ ...config, password: e.target.value })}
                placeholder="••••••••"
                className="w-full bg-white/5 border border-white/10 focus:border-cyan-500/60 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 text-sm outline-none transition-colors"
              />
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={onBack} className="px-5 py-3 text-slate-400 hover:text-white text-sm transition-colors border border-white/10 hover:border-white/20 rounded-xl">
              Geri
            </button>
            <button
              onClick={handleTestAndContinue}
              disabled={loading}
              className="flex-1 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white rounded-xl py-3 text-sm font-bold transition-all flex items-center justify-center gap-2"
            >
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
              {loading ? 'Baglaniyor...' : 'Baglantiyi Test Et ve Devam Et'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'userlist') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6" style={{ background: bg }}>
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-cyan-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <User className="w-8 h-8 text-cyan-400" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">Kullanici Secin</h1>
            <p className="text-slate-400 text-sm">Giris yapmak istediginiz hesabi secin</p>
          </div>

          {error && (
            <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 mb-4 text-red-300 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {loadingUsers ? (
            <div className="flex items-center justify-center py-16">
              <RefreshCw className="w-6 h-6 animate-spin text-cyan-400" />
            </div>
          ) : users.length === 0 ? (
            <div className="text-center text-slate-400 py-10">
              <User className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm">Kullanici bulunamadi</p>
              <p className="text-xs mt-1">Veritabaninda kayitli kullanici yok</p>
            </div>
          ) : (
            <div className="space-y-2 mb-5 max-h-[420px] overflow-y-auto pr-1">
              {users.map(u => (
                <button
                  key={u.id}
                  onClick={() => handleSelectUser(u)}
                  className="w-full flex items-center gap-4 bg-white/5 hover:bg-white/10 active:bg-white/15 border border-white/10 hover:border-cyan-500/30 rounded-2xl px-4 py-3.5 transition-all text-left group"
                >
                  <div className="w-10 h-10 rounded-xl bg-cyan-500/20 flex items-center justify-center flex-shrink-0">
                    <span className="text-cyan-300 font-bold text-sm">
                      {(u.full_name || u.username || '?')[0].toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-medium text-sm truncate">{u.full_name || u.username}</p>
                    {u.username && u.full_name && (
                      <p className="text-slate-500 text-xs truncate">@{u.username}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${roleColor[u.role] || 'bg-slate-500/20 text-slate-300'}`}>
                      {roleLabel[u.role] || u.role}
                    </span>
                    <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-white transition-colors" />
                  </div>
                </button>
              ))}
            </div>
          )}

          <div className="flex flex-col gap-2 mt-2">
            <button
              onClick={() => { setStep('manual'); setError(''); setManualUsername(''); setManualPassword(''); }}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-white/10 hover:border-cyan-500/30 hover:bg-white/5 text-slate-400 hover:text-cyan-300 text-sm transition-all"
            >
              <KeyRound className="w-4 h-4" />
              Manuel kullanici adi ile giris
            </button>
            <button
              onClick={() => { setStep('config'); setError(''); }}
              className="w-full text-slate-500 hover:text-slate-300 text-xs py-2 transition-colors"
            >
              Baglanti ayarlarini degistir
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'manual') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6" style={{ background: bg }}>
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-cyan-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <KeyRound className="w-8 h-8 text-cyan-400" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">Manuel Giris</h1>
            <p className="text-slate-400 text-sm">Kullanici adi ve sifrenizi girin</p>
          </div>

          {error && (
            <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 mb-4 text-red-300 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <div className="space-y-3 mb-5">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Kullanici Adi</label>
              <div className="flex items-center bg-white/5 border border-white/10 focus-within:border-cyan-500/60 rounded-xl px-4 py-3 gap-3">
                <User className="w-4 h-4 text-slate-500 shrink-0" />
                <input
                  type="text"
                  value={manualUsername}
                  onChange={e => setManualUsername(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleManualLogin(); }}
                  placeholder="garson1 veya kullanici@mail.com"
                  className="flex-1 bg-transparent text-white text-sm outline-none placeholder-slate-600"
                  autoComplete="username"
                  autoFocus
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Sifre</label>
              <div className="flex items-center bg-white/5 border border-white/10 focus-within:border-cyan-500/60 rounded-xl px-4 py-3 gap-3">
                <KeyRound className="w-4 h-4 text-slate-500 shrink-0" />
                <input
                  type={showManualPassword ? 'text' : 'password'}
                  value={manualPassword}
                  onChange={e => setManualPassword(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleManualLogin(); }}
                  placeholder="Sifreniz"
                  className="flex-1 bg-transparent text-white text-sm outline-none placeholder-slate-600"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onPointerDown={e => { e.preventDefault(); setShowManualPassword(p => !p); }}
                  className="text-slate-500 hover:text-white transition shrink-0"
                >
                  {showManualPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          <button
            onClick={handleManualLogin}
            disabled={loading || !manualUsername.trim() || !manualPassword}
            className="w-full bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white rounded-xl py-3 text-sm font-bold transition-all flex items-center justify-center gap-2 mb-3"
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : null}
            {loading ? 'Giris yapiliyor...' : 'Giris Yap'}
          </button>

          <button
            onClick={() => { setStep('userlist'); setError(''); }}
            className="w-full text-slate-500 hover:text-slate-300 text-xs py-2 transition-colors"
          >
            Kullanici listesine don
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex" style={{ background: bg }}>
      <div className="flex-1 flex flex-col items-center justify-center px-8 py-12">
        <div className="w-16 h-16 bg-cyan-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <div className="text-cyan-300 font-bold text-xl">
            {((selectedUser?.full_name || selectedUser?.username || '?')[0]).toUpperCase()}
          </div>
        </div>
        <h1 className="text-2xl font-bold text-white mb-1">{selectedUser?.full_name || selectedUser?.username}</h1>
        <p className="text-slate-400 text-sm mb-8">Sifrenizi girin</p>

        {error && (
          <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 mb-4 w-full max-w-xs text-red-300 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        <div className="w-full max-w-xs">
          <div className="bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-center mb-4">
            <div className="text-white/40 text-xs mb-1">Sifre</div>
            <div className="text-white text-2xl tracking-[0.4em] font-mono">
              {'•'.repeat(pinValue.length) || '—'}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 mb-3">
            {numpadRows.map((row, ri) =>
              row.map(({ d, s }) => (
                <NumpadKey key={`${ri}-${d}`} label={d} sub={s || undefined} onPress={() => handlePinKey(d)} />
              ))
            )}
          </div>
          <div className="grid grid-cols-3 gap-2 mb-4">
            <button
              type="button"
              onClick={() => { setStep('userlist'); setPinValue(''); setError(''); }}
              className="flex items-center justify-center rounded-2xl bg-white/5 hover:bg-white/10 text-white/50 hover:text-white text-xs py-4 transition-all"
            >
              Geri
            </button>
            <NumpadKey label="0" onPress={() => handlePinKey('0')} />
            <NumpadBackspace onPress={handlePinDelete} />
          </div>

          <button
            onClick={handlePinLogin}
            disabled={loading || !pinValue}
            className="w-full bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white rounded-xl py-3 text-sm font-bold transition-all flex items-center justify-center gap-2"
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : null}
            {loading ? 'Giris yapiliyor...' : 'Giris Yap'}
          </button>
        </div>
      </div>
    </div>
  );
}

interface TerminalAppProps {
  onExit: () => void;
}

export function TerminalApp({ onExit }: TerminalAppProps) {
  const { user, profile, tenant, activeBranch } = useAuth();
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);

  const handleAfterMergeNavigate = useCallback((next: Table) => {
    if (next.current_order_id) warmOrderItemsForPanel(next.current_order_id);
    setSelectedTable(next);
  }, []);

  const terminalSession = (() => {
    try { return JSON.parse(localStorage.getItem(TERMINAL_SESSION) || 'null'); } catch { return null; }
  })();

  const displayName = profile?.full_name || terminalSession?.full_name || user?.email || 'Terminal';
  const branchName = activeBranch?.name || terminalSession?.branch_name || '';

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="fixed top-0 left-0 right-0 z-30 flex items-center justify-between px-4 py-2.5 bg-gradient-to-r from-cyan-700 to-cyan-800 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
            <Monitor className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="text-white font-bold text-sm leading-none">Terminal Modu</div>
            <div className="text-cyan-200 text-xs mt-0.5">{displayName} {branchName ? `· ${branchName}` : ''}</div>
          </div>
        </div>
        <button
          onClick={onExit}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-medium transition-all"
        >
          <LogOut className="w-3.5 h-3.5" />
          Cikis
        </button>
      </div>

      <div className="fixed inset-0 top-12 bg-gradient-to-br from-slate-50 to-slate-100 overflow-auto">
        <div className="p-3 md:p-6">
          {tenant ? (
            <TableGrid
              onSelectTable={(t) => {
                if (t.current_order_id) warmOrderItemsForPanel(t.current_order_id);
                setSelectedTable(t);
              }}
              onNavigate={() => {}}
              onPrefetchTableOrder={warmOrderItemsForPanel}
            />
          ) : (
            <div className="flex items-center justify-center h-64 text-slate-400">
              <RefreshCw className="w-6 h-6 animate-spin mr-2" />
              Yukleniyor...
            </div>
          )}
        </div>
      </div>

      {selectedTable && (
        <OrderPanel
          table={selectedTable}
          onClose={() => setSelectedTable(null)}
          onAfterMergeNavigate={handleAfterMergeNavigate}
        />
      )}
    </div>
  );
}
