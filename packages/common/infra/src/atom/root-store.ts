import { createStore } from 'jotai';

// global store
let rootStore = createStore();

export function getCurrentStore(): ReturnType<typeof createStore> {
  return rootStore;
}

/**
 * @internal do not use this function unless you know what you are doing
 */
export function _setCurrentStore(store: ReturnType<typeof createStore>) {
  rootStore = store;
}
