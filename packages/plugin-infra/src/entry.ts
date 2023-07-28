import type { getCurrentBlockRange } from '@blocksuite/blocks';
import type { EditorContainer } from '@blocksuite/editor';
import type { Page } from '@blocksuite/store';
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
