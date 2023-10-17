import type { ExpectedLayout } from '@affine/sdk/entry';
import { assertExists } from '@blocksuite/global/utils';
import type { Workspace } from '@blocksuite/store';
import { atom, createStore } from 'jotai/vanilla';

import { getBlockSuiteWorkspaceAtom } from './__internal__/workspace';

// global store
let rootStore = createStore();

export function getCurrentStore() {
  return rootStore;
}

/**
 * @internal do not use this function unless you know what you are doing
 */
export function _setCurrentStore(store: ReturnType<typeof createStore>) {
  rootStore = store;
}

export const loadedPluginNameAtom = atom<string[]>([]);

export const currentWorkspaceIdAtom = atom<string | null>(null);
export const currentPageIdAtom = atom<string | null>(null);
export const currentWorkspaceAtom = atom<Promise<Workspace>>(async get => {
  const workspaceId = get(currentWorkspaceIdAtom);
  assertExists(workspaceId);
  const [currentWorkspaceAtom] = getBlockSuiteWorkspaceAtom(workspaceId);
  return get(currentWorkspaceAtom);
});

const contentLayoutBaseAtom = atom<ExpectedLayout>('editor');

type SetStateAction<Value> = Value | ((prev: Value) => Value);
export const contentLayoutAtom = atom<
  ExpectedLayout,
  [SetStateAction<ExpectedLayout>],
  void
>(
  get => get(contentLayoutBaseAtom),
  (_, set, layout) => {
    set(contentLayoutBaseAtom, prev => {
      let setV: (prev: ExpectedLayout) => ExpectedLayout;
      if (typeof layout !== 'function') {
        setV = () => layout;
      } else {
        setV = layout;
      }
      const nextValue = setV(prev);
      if (nextValue === 'editor') {
        return nextValue;
      }
      if (nextValue.first !== 'editor') {
        throw new Error('The first element of the layout should be editor.');
      }
      if (nextValue.splitPercentage && nextValue.splitPercentage < 70) {
        throw new Error('The split percentage should be greater than 70.');
      }
      return nextValue;
    });
  }
);
