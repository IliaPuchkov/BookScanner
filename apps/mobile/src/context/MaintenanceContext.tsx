import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { maintenanceService, type MaintenanceStatus } from '../services/maintenance.service';

const POLL_INTERVAL_MS = 60_000; // 1 minute

interface MaintenanceContextType extends MaintenanceStatus {
  warningDismissed: boolean;
  dismissWarning: () => void;
  refresh: () => void;
}

const defaultStatus: MaintenanceStatus = {
  isActive: false,
  isWarning: false,
  startsAt: null,
  endsAt: null,
  message: null,
  instructions: null,
};

const MaintenanceContext = createContext<MaintenanceContextType>({
  ...defaultStatus,
  warningDismissed: false,
  dismissWarning: () => {},
  refresh: () => {},
});

export function useMaintenanceContext() {
  return useContext(MaintenanceContext);
}

export function MaintenanceProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<MaintenanceStatus>(defaultStatus);
  const [warningDismissed, setWarningDismissed] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // When maintenance becomes active after warning was dismissed — reset dismissal
  const prevIsWarningRef = useRef(false);
  useEffect(() => {
    if (!status.isWarning && prevIsWarningRef.current) {
      setWarningDismissed(false);
    }
    prevIsWarningRef.current = status.isWarning;
  }, [status.isWarning]);

  const fetchStatus = useCallback(async () => {
    try {
      const result = await maintenanceService.getStatus();
      // Ensure isActive is always a proper boolean (guards against DB returning string "true")
      setStatus({ ...result, isActive: result.isActive === true || (result.isActive as unknown) === 'true' });
    } catch (e) {
      console.error('[Maintenance] Failed to fetch status:', e);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    intervalRef.current = setInterval(fetchStatus, POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchStatus]);

  return (
    <MaintenanceContext.Provider
      value={{
        ...status,
        warningDismissed,
        dismissWarning: () => setWarningDismissed(true),
        refresh: fetchStatus,
      }}
    >
      {children}
    </MaintenanceContext.Provider>
  );
}
