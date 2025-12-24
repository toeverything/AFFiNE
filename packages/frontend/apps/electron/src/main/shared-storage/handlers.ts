import { Subject } from 'rxjs';

import type { NamespaceHandlers } from '../type';
import { globalCacheStorage, globalStateStorage } from './storage';

// Subjects used by shared-storage/events.ts to broadcast updates to all renderer processes
export const globalStateUpdates$ = new Subject<Record<string, any>>();
export const globalCacheUpdates$ = new Subject<Record<string, any>>();

// Revision maps; main generates the next value each time
const globalStateRevisions = new Map<string, number>();
const globalCacheRevisions = new Map<string, number>();

function nextRev(revisions: Map<string, number>, key: string) {
  const r = (revisions.get(key) ?? 0) + 1;
  revisions.set(key, r);
  return r;
}

export const sharedStorageHandlers = {
  getAllGlobalState: async () => {
    return globalStateStorage.all();
  },
  getAllGlobalCache: async () => {
    return globalCacheStorage.all();
  },

  setGlobalState: async (_e, key: string, value: any, sourceId?: string) => {
    const rev = nextRev(globalStateRevisions, key);
    globalStateStorage.set(key, value);
    globalStateUpdates$.next({ [key]: { v: value, r: rev, s: sourceId } });
  },
  delGlobalState: async (_e, key: string, sourceId?: string) => {
    const rev = nextRev(globalStateRevisions, key);
    globalStateStorage.del(key);
    globalStateUpdates$.next({ [key]: { v: undefined, r: rev, s: sourceId } });
  },
  clearGlobalState: async (_e, sourceId?: string) => {
    globalStateRevisions.clear();
    globalStateStorage.clear();
    globalStateUpdates$.next({ '*': { v: undefined, r: 0, s: sourceId } });
  },

  setGlobalCache: async (_e, key: string, value: any, sourceId?: string) => {
    const rev = nextRev(globalCacheRevisions, key);
    globalCacheStorage.set(key, value);
    globalCacheUpdates$.next({ [key]: { v: value, r: rev, s: sourceId } });
  },
  delGlobalCache: async (_e, key: string, sourceId?: string) => {
    const rev = nextRev(globalCacheRevisions, key);
    globalCacheStorage.del(key);
    globalCacheUpdates$.next({ [key]: { v: undefined, r: rev, s: sourceId } });
  },
  clearGlobalCache: async (_e, sourceId?: string) => {
    globalCacheRevisions.clear();
    globalCacheStorage.clear();
    globalCacheUpdates$.next({ '*': { v: undefined, r: 0, s: sourceId } });
  },
} satisfies NamespaceHandlers;
