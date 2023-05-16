import { atom } from 'jotai';
import { atomWithObservable } from 'jotai/utils';
import { atomWithStorage } from 'jotai/utils';
import { Observable } from 'rxjs';

export const APP_SIDEBAR_OPEN = 'app-sidebar-open';
export const appSidebarOpenAtom = atomWithStorage(
  APP_SIDEBAR_OPEN,
  undefined as boolean | undefined
);
export const appSidebarFloatingAtom = atom(false);

export const appSidebarResizingAtom = atom(false);
export const appSidebarWidthAtom = atomWithStorage(
  'app-sidebar-width',
  256 /* px */
);

export const updateReadyAtom = atomWithObservable(() => {
  return new Observable<{ version: string } | null>(subscriber => {
    subscriber.next(null);
    if (typeof window !== 'undefined') {
      const isMacosDesktop = environment.isDesktop && environment.isMacOs;
      if (isMacosDesktop) {
        const dispose = window.events?.updater.onUpdateReady(info => {
          subscriber.next(info);
        });
        return () => {
          dispose?.();
        };
      }
    }
  });
});

export const updateProgressAtom = atomWithObservable<number>(() => {
  return new Observable<number>(subscriber => {
    subscriber.next(0);
    if (typeof window !== 'undefined') {
      const isMacosDesktop = environment.isDesktop && environment.isMacOs;
      if (isMacosDesktop) {
        const dispose = window.events?.updater.onDownloadProgress(progress => {
          subscriber.next(progress);
        });
        return () => {
          dispose?.();
        };
      }
    }
  });
});

export const changelogCheckedAtom = atomWithStorage<Record<string, boolean>>(
  'affine:client-changelog-checked',
  {}
);
