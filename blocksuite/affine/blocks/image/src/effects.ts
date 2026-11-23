import { ImageBlockFallbackCard } from './components/image-block-fallback.js';
import { ImageBlockPageComponent } from './components/page-image-block.js';
import { ImageBlockComponent } from './image-block.js';
import { ImageEdgelessBlockComponent } from './image-edgeless-block.js';
import { ImageEdgelessPlaceholderBlockComponent } from './preview-image/edgeless.js';
import { ImagePlaceholderBlockComponent } from './preview-image/page.js';

export function effects() {
  customElements.define('affine-image', ImageBlockComponent);
  customElements.define('affine-edgeless-image', ImageEdgelessBlockComponent);
  customElements.define('affine-page-image', ImageBlockPageComponent);
  customElements.define('affine-image-fallback-card', ImageBlockFallbackCard);
  customElements.define(
    'affine-placeholder-preview-image',
    ImagePlaceholderBlockComponent
  );
  customElements.define(
    'affine-edgeless-placeholder-preview-image',
    ImageEdgelessPlaceholderBlockComponent
  );
}
