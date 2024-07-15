import {
  Button,
  type DropTargetDropEvent,
  useDropTarget,
} from '@affine/component';
import type { AffineDNDData } from '@affine/core/types/dnd';
import { useI18n } from '@affine/i18n';
import { FolderIcon } from '@blocksuite/icons/rc';
import clsx from 'clsx';

import * as styles from './empty.css';

export const FolderEmpty = ({
  onClickCreate,
  className,
  onDrop,
}: {
  onClickCreate?: () => void;
  onDrop?: (data: DropTargetDropEvent<AffineDNDData>) => void;
  className?: string;
}) => {
  const { dropTargetRef } = useDropTarget(
    () => ({
      onDrop,
    }),
    [onDrop]
  );

  const t = useI18n();
  return (
    <div
      className={clsx(styles.content, styles.draggedOverHighlight, className)}
      ref={dropTargetRef}
    >
      <div className={styles.iconWrapper}>
        <FolderIcon className={styles.icon} />
      </div>
      <div
        data-testid="slider-bar-organize-empty-message"
        className={styles.message}
      >
        {t['com.affine.rootAppSidebar.organize.empty-folder']()}
      </div>
      <Button className={styles.newButton} onClick={onClickCreate}>
        {t['com.affine.rootAppSidebar.organize.empty-folder.add-pages']()}
      </Button>
    </div>
  );
};
