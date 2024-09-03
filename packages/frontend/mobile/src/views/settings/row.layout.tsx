import { DualLinkIcon } from '@blocksuite/icons/rc';
import type { PropsWithChildren, ReactNode } from 'react';

import * as styles from './style.css';

export const RowLayout = ({
  label,
  children,
  href,
}: PropsWithChildren<{ label: ReactNode; href?: string }>) => {
  const content = (
    <div className={styles.baseSettingItem}>
      <div className={styles.baseSettingItemName}>{label}</div>
      <div className={styles.baseSettingItemAction}>
        {children ||
          (href ? <DualLinkIcon className={styles.linkIcon} /> : null)}
      </div>
    </div>
  );

  return href ? (
    <a target="_blank" href={href} rel="noreferrer">
      {content}
    </a>
  ) : (
    content
  );
};
