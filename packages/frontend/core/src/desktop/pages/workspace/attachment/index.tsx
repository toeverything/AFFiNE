import { AttachmentViewer } from '@affine/component/attachment-viewer';
import type { ReactElement } from 'react';

import {
  // useIsActiveView,
  ViewBody,
  ViewHeader,
  ViewIcon,
  ViewTitle,
} from '../../../../modules/workbench';

export const AttachmentPage = (): ReactElement => {
  return (
    <>
      <ViewTitle title={'Attachment'} />
      <ViewIcon icon={'pdf'} />
      <ViewHeader></ViewHeader>
      <ViewBody>
        <AttachmentViewer />
      </ViewBody>
    </>
  );
};

export const Component = () => {
  return <AttachmentPage />;
};
