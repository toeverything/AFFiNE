import type {
  BlockSnapshotLeaf,
  FromSnapshotPayload,
  SnapshotNode,
  ToSnapshotPayload,
} from '@blocksuite/store';
import { BaseBlockTransformer } from '@blocksuite/store';

import type { ImageBlockProps } from './image-model.js';

export class ImageBlockTransformer extends BaseBlockTransformer<ImageBlockProps> {
  override async fromSnapshot(
    payload: FromSnapshotPayload
  ): Promise<SnapshotNode<ImageBlockProps>> {
    const snapshotRet = await super.fromSnapshot(payload);
    const sourceId = snapshotRet.props.sourceId;
    if (!payload.assets.isEmpty() && sourceId && !sourceId.startsWith('/'))
      await payload.assets.writeToBlob(sourceId);

    return snapshotRet;
  }

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
