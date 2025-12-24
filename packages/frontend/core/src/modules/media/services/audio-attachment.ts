import type { AttachmentBlockModel } from '@blocksuite/affine/model';
import {
  attachmentBlockAudioMediaKey,
  type AudioMediaKey,
  ObjectPool,
  Service,
} from '@toeverything/infra';

import { AudioAttachmentBlock } from '../entities/audio-attachment-block';

export class AudioAttachmentService extends Service {
  private readonly pool = new ObjectPool<AudioMediaKey, AudioAttachmentBlock>({
    onDelete: block => {
      block.dispose();
    },
    onDangling: block => {
      return !block.rendering$.value;
    },
  });

  get(model: AttachmentBlockModel | AudioMediaKey) {
    if (typeof model === 'string') {
      return this.pool.get(model);
    }
    if (!model.props.sourceId) {
      throw new Error('Source ID is required');
    }
    const key = attachmentBlockAudioMediaKey({
      blobId: model.props.sourceId,
      blockId: model.id,
      docId: model.store.id,
      workspaceId: model.store.rootDoc.guid,
    });
    let exists = this.pool.get(key);
    if (!exists) {
      const entity = this.framework.createEntity(AudioAttachmentBlock, model);
      exists = this.pool.put(key, entity);

      const subscription = model.deleted.subscribe(() => {
        entity.audioMedia.stop();
        exists?.release();
      });
      this.disposables.push(() => subscription.unsubscribe());
    }
    return exists;
  }
}
