import { AttachmentBlockComponent } from './attachment-block';
import { AttachmentEdgelessBlockComponent } from './attachment-edgeless-block';
import { DrawioViewer } from './drawio/drawio-viewer';

export function effects() {
  customElements.define(
    'affine-edgeless-attachment',
    AttachmentEdgelessBlockComponent
  );
  customElements.define('affine-attachment', AttachmentBlockComponent);
  customElements.define('affine-attachment-drawio-viewer', DrawioViewer);
}
