import { type ReactNode } from 'react';

import * as styles from './index.css';

export const RuntimeSettingRow = ({
  id,
  description,
  lastUpdatedTime,
  operation,
  children,
}: {
  id: string;
  description: string;
  lastUpdatedTime: string;
  operation: ReactNode;
  children: ReactNode;
}) => {
  const formatTime = new Date(lastUpdatedTime).toLocaleString();
  return (
    <div id={id} className={styles.settingItem}>
      <div className={styles.LeftItem}>
        <div className={styles.settingItemTitle}>{description}</div>
        <div>
          <code className={styles.settingItemId}>{id}</code>
        </div>
        <div className={styles.settingItemDescription}>
          last updated at: {formatTime}
        </div>
      </div>
      <div className={styles.RightItem}>
        {operation}
        {children}
      </div>
    </div>
  );
};
