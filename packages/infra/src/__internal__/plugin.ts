import type { CallbackMap } from '@affine/sdk/entry';
import { assertExists } from '@blocksuite/global/utils';
import { atomWithStorage } from 'jotai/utils';
import { atom } from 'jotai/vanilla';
import type { z } from 'zod';

import type { packageJsonOutputSchema } from '../type.js';

export const builtinPluginPaths = new Set([
  '/plugins/bookmark',
  '/plugins/copilot',
  '/plugins/hello-world',
  '/plugins/image-preview',
  '/plugins/vue-hello-world',
  '/plugins/outline',
]);

const pluginCleanupMap = new Map<string, Set<() => void>>();

export function addCleanup(
  pluginName: string,
  cleanup: () => void
): () => void {
  if (!pluginCleanupMap.has(pluginName)) {
    pluginCleanupMap.set(pluginName, new Set());
  }
  const cleanupSet = pluginCleanupMap.get(pluginName);
  assertExists(cleanupSet);
  cleanupSet.add(cleanup);
  return () => {
    cleanupSet.delete(cleanup);
  };
}

export function invokeCleanup(pluginName: string) {
  pluginCleanupMap.get(pluginName)?.forEach(cleanup => cleanup());
  pluginCleanupMap.delete(pluginName);
}

export const pluginPackageJson = atom<
  z.infer<typeof packageJsonOutputSchema>[]
>([]);

export const enabledPluginAtom = atomWithStorage('affine-enabled-plugin', [
  '@affine/bookmark-plugin',
  '@affine/image-preview-plugin',
  '@affine/outline-plugin',
]);

export const pluginHeaderItemAtom = atom<
  Record<string, CallbackMap['headerItem']>
>({});

export const pluginSettingAtom = atom<Record<string, CallbackMap['setting']>>(
  {}
);

export const pluginEditorAtom = atom<Record<string, CallbackMap['editor']>>({});

export const pluginWindowAtom = atom<
  Record<string, (root: HTMLElement) => () => void>
>({});
