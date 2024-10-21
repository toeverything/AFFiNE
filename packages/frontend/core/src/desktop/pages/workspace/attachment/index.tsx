import { PDFViewer } from '@affine/component/pdf-viewer';
import type { ReactElement } from 'react';

export const AttachmentPage = (): ReactElement => {
  return (
    <>
      <div>{'Attachment Viewer'}</div>
      <PDFViewer />
    </>
  );
};

export const Component = () => {
  return <AttachmentPage />;
};
