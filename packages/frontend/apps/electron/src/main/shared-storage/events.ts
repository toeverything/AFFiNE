import type { MainEventRegister } from '../type';
import { globalCacheUpdates$, globalStateUpdates$ } from './handlers';

export const sharedStorageEvents = {
  onGlobalStateChanged: (
    fn: (state: Record<string, unknown | undefined>) => void
  ) => {
    const subscription = globalStateUpdates$.subscribe(fn);
    return () => subscription.unsubscribe();
  },
  onGlobalCacheChanged: (
    fn: (state: Record<string, unknown | undefined>) => void
  ) => {
    const subscription = globalCacheUpdates$.subscribe(fn);
    return () => subscription.unsubscribe();
  },
} satisfies Record<string, MainEventRegister>;
