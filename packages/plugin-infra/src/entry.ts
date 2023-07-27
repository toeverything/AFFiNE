import type { EditorContainer } from '@blocksuite/editor';
import type { FC } from 'react';

export type Part = 'headerItem' | 'editor' | 'window' | 'setting';

export type CallbackMap = {
  headerItem: (root: HTMLElement) => () => void;
  window: (root: HTMLElement) => () => void;
  editor: (root: HTMLElement, editor: EditorContainer) => () => void;
  setting: (root: HTMLElement) => () => void;
};

export interface PluginContext {
  register: <T extends Part>(part: T, callback: CallbackMap[T]) => void;
  utils: {
    PluginProvider: FC;
  };
}
