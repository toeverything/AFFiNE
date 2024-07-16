import type { NamespaceHandlers } from '../type';
import { globalCacheStorage, globalStateStorage } from './storage';

export const sharedStorageHandlers = {
  getAllGlobalState: async () => {
    return globalStateStorage.all();
  },
  getAllGlobalCache: async () => {
    return globalCacheStorage.all();
  },
  setGlobalState: async (_, key: string, value: any) => {
    return globalStateStorage.set(key, value);
  },
  delGlobalState: async (_, key: string) => {
    return globalStateStorage.del(key);
  },
  clearGlobalState: async () => {
    return globalStateStorage.clear();
  },
  setGlobalCache: async (_, key: string, value: any) => {
    return globalCacheStorage.set(key, value);
  },
  delGlobalCache: async (_, key: string) => {
    return globalCacheStorage.del(key);
  },
  clearGlobalCache: async () => {
    return globalCacheStorage.clear();
  },
} satisfies NamespaceHandlers;
