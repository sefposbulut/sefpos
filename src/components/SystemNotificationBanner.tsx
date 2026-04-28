import { useEffect, useState } from 'react';
import { X, Bell, AlertTriangle, CheckCircle, Info, XCircle } from 'lucide-react';
import { playNotificationSound } from '../lib/notification';

interface SystemNotification {
  id: string;
  title: string;
  message: string;
  type: string;
}

interface SystemNotificationBannerProps {
  notification: SystemNotification;
  onDismiss: (id: string) => void;
}

function Banner({ notification, onDismiss }: SystemNotificationBannerProps) {
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 50);
    playNotificationSound();
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => dismiss(), 12000);
    return () => clearTimeout(timer);
  }, []);

  const dismiss = () => {
    setLeaving(true);
    setTimeout(() => onDismiss(notification.id), 400);
  };

  const config: Record<string, { bg: string; border: string; icon: JSX.Element; badge: string }> = {
    info: {
      bg: 'bg-blue-600',
      border: 'border-blue-700',
      icon: <Info className="w-6 h-6 text-white shrink-0" />,
      badge: 'bg-blue-500',
    },
    success: {
      bg: 'bg-green-600',
      border: 'border-green-700',
      icon: <CheckCircle className="w-6 h-6 text-white shrink-0" />,
      badge: 'bg-green-500',
    },
    warning: {
      bg: 'bg-amber-500',
      border: 'border-amber-600',
      icon: <AlertTriangle className="w-6 h-6 text-white shrink-0" />,
      badge: 'bg-amber-400',
    },
    error: {
      bg: 'bg-red-600',
      border: 'border-red-700',
      icon: <XCircle className="w-6 h-6 text-white shrink-0" />,
      badge: 'bg-red-500',
    },
  };

  const c = config[notification.type] || config.info;

  return (
    <div
      className={`
        ${c.bg} ${c.border} border rounded-2xl shadow-2xl p-4 flex items-start gap-3
        transform transition-all duration-400 ease-out
        ${visible && !leaving ? 'translate-y-0 opacity-100 scale-100' : '-translate-y-4 opacity-0 scale-95'}
        max-w-sm w-full ring-1 ring-white/25
      `}
      style={{ minWidth: '300px' }}
    >
      <div className={`${c.badge} p-2 rounded-xl shrink-0`}>
        {c.icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <Bell className="w-3 h-3 text-white/70" />
          <span className="text-white/70 text-[10px] font-bold uppercase tracking-wider">Sistem Bildirimi</span>
        </div>
        <p className="text-white font-black text-sm leading-tight">{notification.title}</p>
        <p className="text-white/90 text-xs mt-1 leading-relaxed">{notification.message}</p>
        <p className="text-[10px] text-white/70 mt-2">Yeni • Okunmadı</p>
      </div>
      <button
        onClick={dismiss}
        className="text-white/60 hover:text-white transition-colors shrink-0 mt-0.5"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

interface SystemNotificationContainerProps {
  notifications: SystemNotification[];
  onDismiss: (id: string) => void;
}

export function SystemNotificationContainer({ notifications, onDismiss }: SystemNotificationContainerProps) {
  if (notifications.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[200] flex flex-col gap-3 pointer-events-none">
      {notifications.map(n => (
        <div key={n.id} className="pointer-events-auto">
          <Banner notification={n} onDismiss={onDismiss} />
        </div>
      ))}
    </div>
  );
}
