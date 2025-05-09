import { LinkPreview } from './link';

export * from './link';

export function effects() {
  customElements.define('affine-link-preview', LinkPreview);
}
