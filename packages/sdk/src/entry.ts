import type { getCurrentBlockRange } from '@blocksuite/blocks';
import type { EditorContainer } from '@blocksuite/editor';
import type { Page } from '@blocksuite/store';
import type { Workspace } from '@blocksuite/store';
import type { Atom, getDefaultStore, PrimitiveAtom } from 'jotai/vanilla';
import type { FC } from 'react';

export type Part = 'headerItem' | 'editor' | 'window' | 'setting' | 'formatBar';

export type CallbackMap = {
  headerItem: (root: HTMLElement) => () => void;
  window: (root: HTMLElement) => () => void;
  editor: (root: HTMLElement, editor: EditorContainer) => () => void;
  setting: (root: HTMLElement) => () => void;
  formatBar: (
    root: HTMLElement,
    page: Page,
    getBlockRange: () => ReturnType<typeof getCurrentBlockRange>
  ) => () => void;
};

export interface PluginContext {
  register: <T extends Part>(part: T, callback: CallbackMap[T]) => void;
  utils: {
    PluginProvider: FC;
  };
}

export type LayoutDirection = 'horizontal' | 'vertical';
export type LayoutNode = LayoutParentNode | string;
export type LayoutParentNode = {
  direction: LayoutDirection;
  splitPercentage: number; // 0 - 100
  first: LayoutNode;
  second: LayoutNode;
};

export type ExpectedLayout =
  | {
      direction: LayoutDirection;
      // the first element is always the editor
      first: 'editor';
      second: LayoutNode;
      // the percentage should be greater than 70
      splitPercentage: number;
    }
  | 'editor';

export declare const contentLayoutAtom: PrimitiveAtom<ExpectedLayout>;
export declare const currentPageAtom: Atom<Promise<Page>>;
export declare const currentWorkspaceAtom: Atom<Promise<Workspace>>;
export declare const rootStore: ReturnType<typeof getDefaultStore>;
