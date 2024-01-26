import { useAFFiNEI18N } from '@affine/i18n/hooks';

import * as styles from './tag-list-header.css';

export const TagListHeader = () => {
  const t = useAFFiNEI18N();
  return (
    <div className={styles.tagListHeader}>
      <div className={styles.tagListHeaderTitle}>{t['Tags']()}</div>
    </div>
  );
};
