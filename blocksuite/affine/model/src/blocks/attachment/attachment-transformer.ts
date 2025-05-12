import type { BlockSnapshotLeaf, ToSnapshotPayload } from '@blocksuite/store';
import { BaseBlockTransformer } from '@blocksuite/store';

import type { AttachmentBlockProps } from './attachment-model.js';

export class AttachmentBlockTransformer extends BaseBlockTransformer<AttachmentBlockProps> {
  override toSnapshot(
    snapshot: ToSnapshotPayload<AttachmentBlockProps>
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
