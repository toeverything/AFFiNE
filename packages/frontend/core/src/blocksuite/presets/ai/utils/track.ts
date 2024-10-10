import track from '@affine/track';
import type { EditorHost } from '@blocksuite/affine/block-std';
import { isInsideEdgelessEditor } from '@blocksuite/affine/blocks';

export function getTracker(host: EditorHost) {
  return track.copilot[isInsideEdgelessEditor(host) ? 'edgeless' : 'page'].$;
}
