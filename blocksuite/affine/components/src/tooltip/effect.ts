import { Tooltip } from './tooltip.js';

export function effects() {
  if (!customElements.get('affine-tooltip')) {
    customElements.define('affine-tooltip', Tooltip);
  }
}
