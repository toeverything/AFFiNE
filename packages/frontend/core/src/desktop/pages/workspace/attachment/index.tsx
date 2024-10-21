import { PDFViewer } from '@affine/component/pdf-viewer';
import type { ReactElement } from 'react';

export const AttachmentPage = (): ReactElement => {
  return (
    <>
      <PDFViewer />
      <div>{'Attachment Viewer'}</div>
    </>
  );
};

export const Component = () => {
  return <AttachmentPage />;
};
