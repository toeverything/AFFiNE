import { LinkPreviewDetails } from './details';
import { LinkPreview } from './link';

export * from './details';
export * from './link';

export function effects() {
  customElements.define('affine-link-preview', LinkPreview);
  customElements.define('affine-link-preview-details', LinkPreviewDetails);
}
