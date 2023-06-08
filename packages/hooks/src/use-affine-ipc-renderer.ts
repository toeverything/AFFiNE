import { useCallback, useEffect, useRef } from 'react';

declare global {
  interface IPCRenderer {
    send(channel: string, ...args: any[]): void;
    invoke(channel: string, ...args: any[]): Promise<any>;
    on(
      channel: string,
      listener: (event: unknown, ...args: any[]) => void
    ): this;
    once(
      channel: string,
      listener: (event: unknown, ...args: any[]) => void
    ): this;
    removeListener(channel: string, listener: (...args: any[]) => void): this;
  }

  interface Window {
    affine: {
      ipcRenderer: IPCRenderer;
    };
  }
}

/**
 * Unsafe
 */
export function useAffineAsyncCallback(channel: string) {
  return useCallback(
    (...args: any[]): Promise<any> => {
      return window.affine.ipcRenderer.invoke(channel, ...args);
    },
    [channel]
  );
}

/**
 * Unsafe
 */
export function useAffineListener(
  channel: string,
  listener: (event: unknown, ...args: any[]) => void,
  once?: boolean
): void {
  const fnRef = useRef<((event: unknown, ...args: any[]) => void) | null>(null);
  if (!fnRef.current) {
    fnRef.current = listener;
  }
  const ipcListener = fnRef.current ?? (fnRef.current = listener);
  useEffect(() => {
    if (once) {
      window.affine.ipcRenderer.once(channel, ipcListener);
    } else {
      window.affine.ipcRenderer.on(channel, ipcListener);
    }
    return () => {
      window.affine.ipcRenderer.removeListener(channel, ipcListener);
    };
  }, [channel, once, ipcListener]);
}
