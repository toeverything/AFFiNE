import { Button } from '@affine/component';
import { useAFFiNEI18N } from '@affine/i18n/hooks';

import * as styles from './tag-list-header.css';

export const TagListHeader = ({ onOpen }: { onOpen: () => void }) => {
  const t = useAFFiNEI18N();
  return (
    <div className={styles.tagListHeader}>
      <div className={styles.tagListHeaderTitle}>{t['Tags']()}</div>
      <Button className={styles.newTagButton} onClick={onOpen}>
        {t['com.affine.tags.empty.new-tag-button']()}
      </Button>
    </div>
  );
};
