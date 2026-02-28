import { ViewBody, ViewHeader } from '@affine/core/modules/workbench';

import { AttachmentFallback, AttachmentPreviewErrorBoundary } from './error';
import { PDFViewer } from './pdf/pdf-viewer';
import type { AttachmentViewerBaseProps, AttachmentViewerProps } from './types';
import { buildAttachmentProps } from './utils';
import { Titlebar } from './viewer';
import * as styles from './viewer.css';

// Peek view
export const AttachmentViewer = ({ model }: AttachmentViewerProps) => {
  const props = buildAttachmentProps(model);

  return (
    <div className={styles.viewerContainer}>
      <Titlebar {...props} />
      <AttachmentViewerInner {...props} />
    </div>
  );
};

// Split view or standalone page
export const AttachmentViewerView = ({ model }: AttachmentViewerProps) => {
  const props = buildAttachmentProps(model);

  return (
    <>
      <ViewHeader>
        <Titlebar {...props} />
      </ViewHeader>
      <ViewBody>
        <AttachmentViewerInner {...props} />
      </ViewBody>
    </>
  );
};

const AttachmentViewerInner = (props: AttachmentViewerBaseProps) => {
  const isPDF = props.model.props.type.endsWith('pdf');

  if (isPDF) {
    return (
      <AttachmentPreviewErrorBoundary>
        <PDFViewer {...props} />
      </AttachmentPreviewErrorBoundary>
    );
  }

  return <AttachmentFallback {...props} />;
};
