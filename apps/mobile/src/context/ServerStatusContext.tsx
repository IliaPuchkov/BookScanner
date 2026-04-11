import React, { createContext, useContext, useState, useEffect } from 'react';
import { onServerStatusChange } from '../services/api';

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

  useEffect(() => {
    return onServerStatusChange((reachable) => {
      setServerUnreachable(!reachable);
    });
  }, []);

  return (
    <ServerStatusContext.Provider value={{ serverUnreachable }}>
      {children}
    </ServerStatusContext.Provider>
  );
}
