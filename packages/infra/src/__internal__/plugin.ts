import type { CallbackMap } from '@affine/sdk/entry';
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
]);

const pluginCleanupMap = new Map<string, (() => void)[]>();

export function addCleanup(pluginName: string, cleanup: () => void) {
  if (!pluginCleanupMap.has(pluginName)) {
    pluginCleanupMap.set(pluginName, []);
  }
  pluginCleanupMap.get(pluginName)?.push(cleanup);
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
]);

function divAtom(debugLabel?: string) {
  const aAtom = atom(() => {
    if (environment.isBrowser) {
      return document.createElement('div');
    } else {
      throw new Error('divAtom is only available in browser');
    }
  });
  aAtom.debugLabel = debugLabel;
  return aAtom;
}

export const headerRootDivAtom = divAtom('headerRootDiv');

export const settingRootDivAtom = divAtom('settingRootDiv');

export const editorItemsAtom = atom<Record<string, CallbackMap['editor']>>({});

export const windowItemAtom = atom<Record<string, CallbackMap['window']>>({});
