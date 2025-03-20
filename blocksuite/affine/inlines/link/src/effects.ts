import { AffineLink } from './link-node/affine-link';
import { LinkPopup } from './link-node/link-popup/link-popup';

export function effects() {
  customElements.define('link-popup', LinkPopup);
  customElements.define('affine-link', AffineLink);
}
