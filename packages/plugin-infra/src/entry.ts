import type { EditorContainer } from '@blocksuite/editor';

export type Part = 'headerItem' | 'editor';

export type CallbackMap = {
  headerItem: (root: HTMLElement) => () => void;
  editor: (root: HTMLElement, editor: EditorContainer) => () => void;
};

export interface PluginContext {
  register: <T extends Part>(part: T, callback: CallbackMap[T]) => void;
}
