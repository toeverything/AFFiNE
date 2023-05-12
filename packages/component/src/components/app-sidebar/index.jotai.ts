import { atom } from 'jotai';
import { atomWithObservable } from 'jotai/utils';
import { atomWithStorage } from 'jotai/utils';
import { Observable } from 'rxjs';

export const APP_SIDEBAR_OPEN = 'app-sidebar-open';
export const appSidebarOpenAtom = atomWithStorage(
  APP_SIDEBAR_OPEN,
  undefined as boolean | undefined
);
export const appSidebarResizingAtom = atom(false);
export const appSidebarWidthAtom = atomWithStorage(
  'app-sidebar-width',
  256 /* px */
);

export const updateAvailableAtom = atomWithObservable<boolean>(() => {
  return new Observable<boolean>(subscriber => {
    subscriber.next(false);
    if (typeof window !== 'undefined') {
      const isMacosDesktop = environment.isDesktop && environment.isMacOs;
      if (isMacosDesktop) {
        const dispose = window.events?.updater.onClientUpdateReady(() => {
          subscriber.next(true);
        });
        return () => {
          dispose?.();
        };
      }
    }
  });
});
