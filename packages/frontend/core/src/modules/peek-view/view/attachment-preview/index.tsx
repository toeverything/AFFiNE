import { AttachmentViewer } from '@affine/core/blocksuite/attachment-viewer';
import type { AttachmentBlockModel } from '@blocksuite/affine/model';
import { useMemo } from 'react';

import { useEditor } from '../utils';

export type AttachmentPreviewModalProps = {
  docId: string;
  blockId: string;
};

export const AttachmentPreviewPeekView = ({
  docId,
  blockId,
}: AttachmentPreviewModalProps) => {
  const { doc } = useEditor(docId);
  const blocksuiteDoc = doc?.blockSuiteDoc;
  const model = useMemo(
    () => blocksuiteDoc?.getModelById<AttachmentBlockModel>(blockId) ?? null,
    [blockId, blocksuiteDoc]
  );

  if (model) {
    return <AttachmentViewer model={model} />;
  }

  return null;
};
