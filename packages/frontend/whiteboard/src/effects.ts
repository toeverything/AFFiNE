import { HelloBlockComponent } from './blocks/hello/hello-block';
import { HelloEdgelessBlockComponent } from './blocks/hello/hello-edgeless-block';
import { HelloPreviewBlockComponent } from './blocks/hello/hello-preview-block';

export function effects() {
  customElements.define('wb-hello', HelloBlockComponent);
  customElements.define('wb-hello-edgeless', HelloEdgelessBlockComponent);
  customElements.define('wb-hello-preview', HelloPreviewBlockComponent);
}
