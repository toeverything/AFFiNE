import type { BaseSelection } from '@blocksuite/block-std';
import type { EditorContainer } from '@blocksuite/editor';
import type { Page } from '@blocksuite/store';
import type { Workspace } from '@blocksuite/store';
import type { Atom, getDefaultStore } from 'jotai/vanilla';
import type { WritableAtom } from 'jotai/vanilla/atom';
import type { FunctionComponent } from 'react';

export type Part = 'headerItem' | 'editor' | 'setting' | 'formatBar';

export type CallbackMap = {
  headerItem: (root: HTMLElement) => () => void;
  editor: (root: HTMLElement, editor: EditorContainer) => () => void;
  setting: (root: HTMLElement) => () => void;
  formatBar: (
    root: HTMLElement,
    page: Page,
    getBlockRange: () => BaseSelection[]
  ) => () => void;
};

export interface PluginContext {
  register: <T extends Part>(part: T, callback: CallbackMap[T]) => void;
  utils: {
    PluginProvider: FunctionComponent; // make more clear
  };
}

export type LayoutDirection = 'horizontal' | 'vertical';
export type LayoutNode = LayoutParentNode | string;
export type LayoutParentNode = {
  direction: LayoutDirection;
  splitPercentage: number; // 0 - 100
  first: string;
  second: LayoutNode;
};

export type ExpectedLayout =
  | {
      direction: 'horizontal';
      // the first element is always the editor
      first: 'editor';
      second: LayoutNode;
      // the percentage should be greater than 70
      splitPercentage: number;
    }
  | 'editor';

export declare const pushLayoutAtom: WritableAtom<
  null,
  [string, (div: HTMLDivElement) => () => void],
  void
>;
export declare const deleteLayoutAtom: WritableAtom<null, [string], void>;
export declare const currentPageAtom: Atom<Promise<Page>>;
export declare const currentWorkspaceAtom: Atom<Promise<Workspace>>;
export declare const rootStore: ReturnType<typeof getDefaultStore>;
