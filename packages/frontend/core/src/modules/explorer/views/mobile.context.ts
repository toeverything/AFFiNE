import { createContext } from 'react';

/**
 * To enable mobile manually
 * > Using `environment.isMobile` directly will affect current web entry on mobile
 * > So we control it manually for now
 */
export const ExplorerMobileContext = createContext(false);
