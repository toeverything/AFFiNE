import type { AttachmentBlockModel } from '@blocksuite/affine/model';
import { useService } from '@toeverything/infra';
import { useEffect, useState } from 'react';

import type { AudioAttachmentBlock } from '../entities/audio-attachment-block';
import { AudioAttachmentService } from '../services/audio-attachment';

export const useAttachmentMediaBlock = (model: AttachmentBlockModel) => {
  const audioAttachmentService = useService(AudioAttachmentService);
  const [audioAttachmentBlock, setAttachmentMedia] = useState<
    AudioAttachmentBlock | undefined
  >(undefined);

  useEffect(() => {
    if (!model.props.sourceId) {
      return;
    }
    const entity = audioAttachmentService.get(model);
    if (!entity) {
      return;
    }
    const audioAttachmentBlock = entity.obj;
    setAttachmentMedia(audioAttachmentBlock);
    audioAttachmentBlock.mount();
    return () => {
      audioAttachmentBlock.unmount();
      entity.release();
    };
  }, [audioAttachmentService, model]);
  return audioAttachmentBlock;
};
