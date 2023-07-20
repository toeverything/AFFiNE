export type Part = 'headerItem';

export interface PluginContext {
  register: (part: Part, callback: (root: HTMLElement) => void) => () => void;
}
