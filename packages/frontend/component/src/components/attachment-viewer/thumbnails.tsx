import { CollapseIcon, ExpandIcon } from '@blocksuite/icons/rc';
import clsx from 'clsx';
import { type ReactElement,useState } from 'react';

import { IconButton } from '../../ui/button';
import * as styles from './styles.css';

export const Thumbnails = (): ReactElement => {
  const [collapsed, setCollapsed] = useState(true);

  return (
    <div className={styles.thumbnails}>
      <div
        className={clsx([
          styles.thumbnailsPages,
          {
            collapsed,
          },
        ])}
      >
        <div className={styles.thumbnailsPage} style={{ height: '80px' }}></div>
        <div
          className={clsx([
            styles.thumbnailsPage,
            {
              selected: true,
            },
          ])}
          style={{ height: '80px' }}
        ></div>
        <div className={styles.thumbnailsPage} style={{ height: '80px' }}></div>
      </div>
      <div className={styles.thumbnailsIndicator}>
        <div>
          <span>1</span>/<span>3</span>
        </div>
        <IconButton
          icon={collapsed ? <CollapseIcon /> : <ExpandIcon />}
          onClick={() => setCollapsed(state => !state)}
        />
      </div>
    </div>
  );
};
