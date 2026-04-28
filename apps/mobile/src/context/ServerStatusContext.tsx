import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import api, { onServerStatusChange } from '../services/api';

const RECOVERY_POLL_MS = 10_000;

interface ServerStatusContextType {
  serverUnreachable: boolean;
}

const ServerStatusContext = createContext<ServerStatusContextType>({
  serverUnreachable: false,
});

export function useServerStatusContext() {
  return useContext(ServerStatusContext);
}

export function ServerStatusProvider({ children }: { children: React.ReactNode }) {
  const [serverUnreachable, setServerUnreachable] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return onServerStatusChange((reachable) => {
      setServerUnreachable(!reachable);
    });
  }, []);

  // When offline, poll every 10s until server responds
  useEffect(() => {
    if (serverUnreachable) {
      intervalRef.current = setInterval(async () => {
        try {
          await api.get('/maintenance', { timeout: 8000 });
          // Success — the response interceptor in api.ts calls _notifyServerStatus(true),
          // which triggers onServerStatusChange and sets serverUnreachable = false
        } catch {
          // Still unreachable, keep polling
        }
      }, RECOVERY_POLL_MS);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [serverUnreachable]);

  return (
    <ServerStatusContext.Provider value={{ serverUnreachable }}>
      {children}
    </ServerStatusContext.Provider>
  );
}
