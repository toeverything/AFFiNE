import type {
  BlockSnapshotLeaf,
  FromSnapshotPayload,
  SnapshotNode,
  ToSnapshotPayload,
} from '@blocksuite/store';
import { BaseBlockTransformer } from '@blocksuite/store';

import type { BookmarkBlockProps } from './bookmark-model.js';

export class BookmarkBlockTransformer extends BaseBlockTransformer<BookmarkBlockProps> {
  override async fromSnapshot(
    payload: FromSnapshotPayload
  ): Promise<SnapshotNode<BookmarkBlockProps>> {
    const snapshot = await super.fromSnapshot(payload);
    const sourceId = snapshot.props.sharePreviewSourceId;
    if (!payload.assets.isEmpty() && sourceId) {
      await payload.assets.writeToBlob(sourceId);
    }
    return snapshot;
  }

  override toSnapshot(
    payload: ToSnapshotPayload<BookmarkBlockProps>
  ): BlockSnapshotLeaf {
    const snapshot = super.toSnapshot(payload);
    const sourceId = payload.model.props.sharePreviewSourceId;
    if (sourceId) {
      payload.assets.getPathBlobIdMap().set(payload.model.id, sourceId);
    }
    return snapshot;
  }
}
