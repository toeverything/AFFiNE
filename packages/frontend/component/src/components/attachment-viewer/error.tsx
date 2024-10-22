import { ArrowDownBigIcon, PageIcon } from '@blocksuite/icons/rc';
import clsx from 'clsx';
import type { ReactElement } from 'react';

import { Button } from '../../ui/button';
import * as styles from './styles.css';

interface ErrorProps {
  isPDF: boolean;
}

export const Error = (_: ErrorProps): ReactElement => {
  return (
    <div className={clsx([styles.body, styles.error])}>
      <PageIcon />
      <h3 className={styles.errorTitle}>Unable to preview this file</h3>
      <p className={styles.errorMessage}>.dmg file type not supported.</p>
      <div className={styles.errorBtns}>
        <Button variant="primary" prefix={<ArrowDownBigIcon />}>
          Download
        </Button>
        <Button>Retry</Button>
      </div>
    </div>
  );
};
