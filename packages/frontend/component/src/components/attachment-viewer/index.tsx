import { type ReactElement, useState } from 'react';

import { Error } from './error';
import * as styles from './styles.css';
import { Titlebar } from './titlebar';
import { Viewer } from './viewer';

export const AttachmentViewer = (): ReactElement => {
  const [isPDF] = useState(true);

  return (
    <div className={styles.viewerContainer}>
      <Titlebar
        id={'0'}
        name={'AFFiNE'}
        size={10}
        unit={'MB'}
        ext=".pdf"
        zoom={100}
        isPDF={isPDF}
      />
      {isPDF ? <Viewer /> : <Error isPDF />}
    </div>
  );
};
