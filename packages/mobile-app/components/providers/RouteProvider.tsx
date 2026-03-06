/**
 * Provider component for managing and sharing route information across the app.
 * Uses React Context to make route information available to all components.
 */

import React, { createContext, useContext } from 'react';
import { usePathname } from 'expo-router';

interface RouteContextType {
  isSharedRoute: boolean;
}

const RouteContext = createContext<RouteContextType | undefined>(undefined);

export function useRoute() {
  const context = useContext(RouteContext);
  if (context === undefined) {
    throw new Error('useRoute must be used within a RouteProvider');
  }
  return context;
}

export function RouteProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isSharedRoute = pathname?.startsWith('/shared') ?? false;

  return (
    <RouteContext.Provider value={{ isSharedRoute }}>
      {children}
    </RouteContext.Provider>
  );
}