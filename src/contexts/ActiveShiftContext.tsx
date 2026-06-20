import { createContext, useContext, type ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { useActiveShift } from '../lib/useActiveShift';

type ActiveShiftContextValue = ReturnType<typeof useActiveShift>;

const ActiveShiftContext = createContext<ActiveShiftContextValue | null>(null);

/** Header + vardiya modal tek dinleyici — çift poll / Realtime kanalı önlenir. */
export function ActiveShiftProvider({
  children,
  trackingEnabled = true,
}: {
  children: ReactNode;
  trackingEnabled?: boolean;
}) {
  const { tenant, user, activeBranch, shiftsEnabled, permissions, businessDayStartHour } = useAuth();
  const canUseShifts = !!permissions?.can_use_shifts;
  const value = useActiveShift({
    tenantId: tenant?.id || null,
    branchId: activeBranch?.id || null,
    userId: user?.id || null,
    enabled: trackingEnabled && !!tenant && shiftsEnabled && canUseShifts,
    cutoffHour: businessDayStartHour,
  });
  return (
    <ActiveShiftContext.Provider value={value}>
      {children}
    </ActiveShiftContext.Provider>
  );
}

export function usePersonalActiveShift(): ActiveShiftContextValue {
  const ctx = useContext(ActiveShiftContext);
  if (!ctx) {
    throw new Error('usePersonalActiveShift ActiveShiftProvider içinde kullanılmalı');
  }
  return ctx;
}
