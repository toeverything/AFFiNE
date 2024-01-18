// main editor sidebar states
import { assertExists } from '@blocksuite/global/utils';
import { atom } from 'jotai';
import { selectAtom } from 'jotai/utils';

import { copilotExtension } from './extensions/copilot';
import { framePanelExtension } from './extensions/frame';
import { outlineExtension } from './extensions/outline';
import type { EditorExtension, EditorExtensionName } from './types';

// the list of all possible extensions in affine.
// order matters (determines the order of the tabs)
export const extensions: EditorExtension[] = [
  outlineExtension,
  framePanelExtension,
  copilotExtension,
];

export interface EditorSidebarState {
  isOpen: boolean;
  width: number;
  resizing: boolean;
  activeExtension?: EditorExtension;
  extensions: EditorExtension[];
}

const baseStateAtom = atom<EditorSidebarState>({
  isOpen: false,
  resizing: false,
  width: 300, // todo: should be resizable
  activeExtension: extensions[0],
  extensions: extensions, // todo: maybe should be dynamic (by feature flag?)
});

const isOpenAtom = selectAtom(baseStateAtom, state => state.isOpen);
const resizingAtom = selectAtom(baseStateAtom, state => state.resizing);
const activeExtensionAtom = selectAtom(
  baseStateAtom,
  state => state.activeExtension
);
const widthAtom = selectAtom(baseStateAtom, state => state.width);

export const editorExtensionsAtom = selectAtom(
  baseStateAtom,
  state => state.extensions
);

// get/set sidebar open state
export const editorSidebarOpenAtom = atom(
  get => get(isOpenAtom),
  (_, set, isOpen: boolean) => {
    set(baseStateAtom, prev => {
      return { ...prev, isOpen };
    });
  }
);

// get/set sidebar resizing state
export const editorSidebarResizingAtom = atom(
  get => get(resizingAtom),
  (_, set, resizing: boolean) => {
    set(baseStateAtom, prev => {
      return { ...prev, resizing };
    });
  }
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

// toggle sidebar (write only)
export const editorSidebarToggleAtom = atom(null, (_, set) => {
  set(baseStateAtom, prev => {
    return { ...prev, isOpen: !prev.isOpen };
  });
});

// get/set sidebar width
export const editorSidebarWidthAtom = atom(
  get => get(widthAtom),
  (_, set, width: number) => {
    set(baseStateAtom, prev => {
      return { ...prev, width };
    });
  }
);
