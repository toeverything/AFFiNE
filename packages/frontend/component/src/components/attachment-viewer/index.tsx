import { humanFileSize } from '@blocksuite/affine-shared/utils';
import type { AttachmentBlockModel } from '@blocksuite/blocks';
import { type ReactElement, useMemo } from 'react';

import { Error } from './error';
import * as styles from './styles.css';
import { Titlebar } from './titlebar';
import { Viewer } from './viewer';

export type AttachmentViewerProps = {
  model: AttachmentBlockModel;
};

export const AttachmentViewer = ({
  model,
}: AttachmentViewerProps): ReactElement => {
  const attachment = useMemo(() => {
    const pieces = model.name.split('.');
    const ext = pieces.pop() || '';
    const name = pieces.join('.');
    const isPDF = ext === 'pdf';
    const filesize = humanFileSize(model.size);

    return { model, name, ext, filesize, isPDF };
  }, [model]);

  return (
    <div className={styles.viewerContainer}>
      <Titlebar {...attachment} />
      {attachment.isPDF ? <Viewer /> : <Error {...attachment} />}
    </div>
  );
};
