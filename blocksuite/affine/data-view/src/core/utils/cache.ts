import { computed, type ReadonlySignal } from '@preact/signals-core';

export const cacheComputed = <T>(
  ids: ReadonlySignal<string[]>,
  create: (id: string) => T
) => {
  const cache = new Map<string, T>();
  const getOrCreate = (id: string): T => {
    if (cache.has(id)) {
      return cache.get(id)!;
    }
    const value = create(id);
    if (value) {
      cache.set(id, value);
    }
    return value;
  };
  return {
    getOrCreate,
    list: computed<T[]>(() => {
      const list = ids.value;
      const keys = new Set(cache.keys());
      for (const [cachedId] of cache) {
        keys.delete(cachedId);
      }
      for (const id of keys) {
        cache.delete(id);
      }
      return list.map(id => getOrCreate(id));
    }),
  };
};
