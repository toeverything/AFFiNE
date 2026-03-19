import {
  ViewBody,
  ViewHeader,
} from '@affine/core/modules/workbench/view/view-islands';

import { AttachmentFallback, AttachmentPreviewErrorBoundary } from './error';
import { PDFViewer } from './pdf/pdf-viewer';
import { TextViewer } from './text/text-viewer';
import type { AttachmentViewerBaseProps, AttachmentViewerProps } from './types';
import { buildAttachmentProps, getAttachmentType } from './utils';
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
  const type = getAttachmentType(props.model);

  if (type === 'pdf') {
    return (
      <AttachmentPreviewErrorBoundary>
        <PDFViewer {...props} />
      </AttachmentPreviewErrorBoundary>
    );
  }

  if (type === 'text') {
    return <TextViewer model={props.model} />;
  }

  return <AttachmentFallback {...props} />;
};
