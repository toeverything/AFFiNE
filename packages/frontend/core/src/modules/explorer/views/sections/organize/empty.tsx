import { Button } from '@affine/component';
import { useI18n } from '@affine/i18n';
import { FolderIcon } from '@blocksuite/icons/rc';

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
        <FolderIcon className={styles.icon} />
      </div>
      <div
        data-testid="slider-bar-organize-empty-message"
        className={styles.message}
      >
        {t['com.affine.rootAppSidebar.organize.empty']()}
      </div>
      <Button className={styles.newButton} onClick={onClickCreate}>
        {t['com.affine.rootAppSidebar.organize.empty.new-folders-button']()}
      </Button>
    </div>
  );
};
