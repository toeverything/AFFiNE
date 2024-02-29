// main editor sidebar states
import { assertExists, isEqual } from '@blocksuite/global/utils';
import { atom } from 'jotai';
import { selectAtom } from 'jotai/utils';

import { copilotExtension } from './extensions/copilot';
import { framePanelExtension } from './extensions/frame';
import { journalExtension } from './extensions/journal';
import { outlineExtension } from './extensions/outline';
import type { EditorExtension, EditorExtensionName } from './types';

// the list of all possible extensions in affine.
// order matters (determines the order of the tabs)
export const extensions: EditorExtension[] = [
  journalExtension,
  outlineExtension,
  framePanelExtension,
  copilotExtension,
];

export interface EditorSidebarState {
  activeExtension?: EditorExtension;
  extensions: EditorExtension[];
}

const baseStateAtom = atom<EditorSidebarState>({
  activeExtension: extensions[0],
  extensions: extensions, // todo: maybe should be dynamic (by feature flag?)
});

const activeExtensionAtom = selectAtom(
  baseStateAtom,
  state => state.activeExtension
);

export const editorExtensionsAtom = selectAtom(
  baseStateAtom,
  state => state.extensions,
  isEqual
);

// get/set active extension
export const editorSidebarActiveExtensionAtom = atom(
  get => get(activeExtensionAtom),
  (_, set, extension: EditorExtensionName) => {
    set(baseStateAtom, prev => {
      const extensions = prev.extensions;
      const newExtension = extensions.find(e => e.name === extension);
      assertExists(newExtension, `extension ${extension} not found`);
      return { ...prev, activeExtension: newExtension };
    });
  }
);
