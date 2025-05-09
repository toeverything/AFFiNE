import { EdgelessLineWidthPanel } from './line-width-panel';

export * from './line-width-panel';

export function effects() {
  customElements.define('edgeless-line-width-panel', EdgelessLineWidthPanel);
}
