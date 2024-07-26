import { Button } from '@affine/component';
import { useI18n } from '@affine/i18n';
import { TagIcon } from '@blocksuite/icons/rc';

import * as styles from './empty.css';

export const RootEmpty = ({
  onClickCreate,
}: {
  onClickCreate?: () => void;
}) => {
  const t = useI18n();

  return (
    <div className={styles.content}>
      <div className={styles.iconWrapper}>
        <TagIcon className={styles.icon} />
      </div>
      <div
        data-testid="slider-bar-tags-empty-message"
        className={styles.message}
      >
        {t['com.affine.rootAppSidebar.tags.empty']()}
      </div>
      <Button className={styles.newButton} onClick={onClickCreate}>
        {t['com.affine.rootAppSidebar.tags.empty.new-tag-button']()}
      </Button>
    </div>
  );
};
