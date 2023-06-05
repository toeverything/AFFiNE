/// <reference types="@affine/env" />
import { useCallback, useEffect, useRef } from 'react';

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
  useEffect(() => {
    if (once) {
      window.affine.ipcRenderer.once(channel, fnRef.current!);
    } else {
      window.affine.ipcRenderer.on(channel, fnRef.current!);
    }
    return () => {
      window.affine.ipcRenderer.removeListener(channel, fnRef.current!);
    };
  }, [channel, once]);
}
