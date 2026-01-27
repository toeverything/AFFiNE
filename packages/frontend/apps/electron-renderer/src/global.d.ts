import type { apis, events } from '@affine/electron-api';

/**
 * Extends the global Window interface to include AFFiNE's 
 * Electron bridge APIs and event emitters.
 */
declare global {
  interface Window {
    __apis?: {
      apis: typeof apis;
      events: typeof events;
    };
  }
}

export {};
