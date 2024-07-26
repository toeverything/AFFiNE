import { Button } from '@affine/component';
import { useI18n } from '@affine/i18n';
import { ViewLayersIcon } from '@blocksuite/icons/rc';

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
        <ViewLayersIcon className={styles.icon} />
      </div>
      <div
        data-testid="slider-bar-collection-empty-message"
        className={styles.message}
      >
        {t['com.affine.collections.empty.message']()}
      </div>
      <Button className={styles.newButton} onClick={onClickCreate}>
        {t['com.affine.collections.empty.new-collection-button']()}
      </Button>
    </div>
  );
};
