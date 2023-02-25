import { Theme } from '@affine/component';
import { useCallback, useSyncExternalStore } from 'react';

const themeRef = {
  current: 'light',
  media: null,
} as {
  current: Theme;
  media: MediaQueryList | null;
};

if (typeof window !== 'undefined') {
  themeRef.media = window.matchMedia('(prefers-color-scheme: light)');
}

export function useSystemTheme() {
  return useSyncExternalStore<Theme>(
    useCallback(onStoreChange => {
      if (themeRef.media) {
        const media = themeRef.media;
        media.addEventListener('change', onStoreChange);
        return () => {
          media.addEventListener('change', onStoreChange);
        };
      }
      return () => {};
    }, []),
    useCallback(
      () =>
        themeRef.media ? (themeRef.media.matches ? 'light' : 'dark') : 'light',
      []
    ),
    useCallback(() => 'light', [])
  );
}
