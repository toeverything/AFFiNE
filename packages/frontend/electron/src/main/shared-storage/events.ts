import type { MainEventRegister } from '../type';
import { globalCacheStorage, globalStateStorage } from './storage';

export const sharedStorageEvents = {
  onGlobalStateChanged: (
    fn: (state: Record<string, unknown | undefined>) => void
  ) => {
    const subscription = globalStateStorage.watchAll().subscribe(updates => {
      fn(updates);
    });
    return () => {
      subscription.unsubscribe();
    };
  },
  onGlobalCacheChanged: (
    fn: (state: Record<string, unknown | undefined>) => void
  ) => {
    const subscription = globalCacheStorage.watchAll().subscribe(updates => {
      fn(updates);
    });
    return () => {
      subscription.unsubscribe();
    };
  },
} satisfies Record<string, MainEventRegister>;
