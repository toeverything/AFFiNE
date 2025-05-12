import type { BlockSnapshotLeaf, ToSnapshotPayload } from '@blocksuite/store';
import { BaseBlockTransformer } from '@blocksuite/store';

import type { ImageBlockProps } from './image-model.js';

export class ImageBlockTransformer extends BaseBlockTransformer<ImageBlockProps> {
  override toSnapshot(
    snapshot: ToSnapshotPayload<ImageBlockProps>
  ): BlockSnapshotLeaf {
    const snapshotRet = super.toSnapshot(snapshot);
    const sourceId = snapshot.model.props.sourceId;
    if (sourceId) {
      const pathBlobIdMap = snapshot.assets.getPathBlobIdMap();
      pathBlobIdMap.set(snapshot.model.id, sourceId);
    }
    return snapshotRet;
  }
}
