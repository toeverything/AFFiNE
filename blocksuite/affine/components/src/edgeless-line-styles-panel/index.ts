import { EdgelessLineStylesPanel } from './line-styles-panel';

export * from './line-styles-panel';

export function effects() {
  customElements.define('edgeless-line-styles-panel', EdgelessLineStylesPanel);
}
