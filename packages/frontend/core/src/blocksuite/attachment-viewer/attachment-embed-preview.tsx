import { useMemo } from 'react';

import { AudioBlockEmbedded } from './audio/audio-block';
import { AttachmentPreviewErrorBoundary } from './error';
import { PDFViewerEmbedded } from './pdf/pdf-viewer-embedded';
import type { AttachmentViewerProps } from './types';
import { getAttachmentType } from './utils';

// Embed view
export const AttachmentEmbedPreview = ({ model }: AttachmentViewerProps) => {
  const attachmentType = getAttachmentType(model);
  const element = useMemo(() => {
    switch (attachmentType) {
      case 'pdf':
        return <PDFViewerEmbedded model={model} />;
      case 'audio':
        return <AudioBlockEmbedded model={model} />;
      default:
        return null;
    }
  }, [attachmentType, model]);
  return (
    <AttachmentPreviewErrorBoundary>{element}</AttachmentPreviewErrorBoundary>
  );
};
