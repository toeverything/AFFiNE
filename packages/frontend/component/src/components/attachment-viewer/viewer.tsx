import clsx from 'clsx';
import type { ReactElement } from 'react';

import { Scrollable } from '../../ui/scrollbar';
import * as styles from './styles.css';
import { Thumbnails } from './thumbnails';

interface ViewerProps {}

export const Viewer = (_: ViewerProps): ReactElement => {
  return (
    <>
      <Scrollable.Root
        className={clsx([
          styles.body,
          {
            gridding: true,
            scrollable: true,
          },
        ])}
      >
        <Scrollable.Viewport className={styles.viewerViewport}>
          <div
            className={styles.viewerPage}
            style={{ width: '595px', height: '842px' }}
          >
            1
          </div>
          <div
            className={styles.viewerPage}
            style={{ width: '595px', height: '842px' }}
          >
            2
          </div>
          <div
            className={styles.viewerPage}
            style={{ width: '595px', height: '842px' }}
          >
            3
          </div>
          <div
            className={styles.viewerPage}
            style={{ width: '595px', height: '842px' }}
          >
            4
          </div>
          <div
            className={styles.viewerPage}
            style={{ width: '595px', height: '842px' }}
          >
            5
          </div>
          <div
            className={styles.viewerPage}
            style={{ width: '595px', height: '842px' }}
          >
            6
          </div>
          <div
            className={styles.viewerPage}
            style={{ width: '595px', height: '842px' }}
          >
            7
          </div>
          <div
            className={styles.viewerPage}
            style={{ width: '595px', height: '842px' }}
          >
            8
          </div>
          <div
            className={styles.viewerPage}
            style={{ width: '595px', height: '842px' }}
          >
            9
          </div>
          <div
            className={styles.viewerPage}
            style={{ width: '595px', height: '842px' }}
          >
            10
          </div>
          <div
            className={styles.viewerPage}
            style={{ width: '595px', height: '842px' }}
          >
            11
          </div>
          <div
            className={styles.viewerPage}
            style={{ width: '595px', height: '842px' }}
          >
            12
          </div>
        </Scrollable.Viewport>
        <Scrollable.Scrollbar />
      </Scrollable.Root>
      <Thumbnails />
    </>
  );
};
