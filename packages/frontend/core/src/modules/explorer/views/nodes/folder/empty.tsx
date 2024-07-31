import {
  type DropTargetDropEvent,
  type DropTargetOptions,
  useDropTarget,
} from '@affine/component';
import type { AffineDNDData } from '@affine/core/types/dnd';
import { useI18n } from '@affine/i18n';
import { FolderIcon } from '@blocksuite/icons/rc';
import clsx from 'clsx';

import { ExplorerGroupEmpty } from '../../layouts/empty-layout';
import * as styles from './empty.css';

export const FolderEmpty = ({
  onClickCreate,
  className,
  canDrop,
  onDrop,
}: {
  onClickCreate?: () => void;
  onDrop?: (data: DropTargetDropEvent<AffineDNDData>) => void;
  canDrop?: DropTargetOptions<AffineDNDData>['canDrop'];
  className?: string;
}) => {
  const { dropTargetRef } = useDropTarget(
    () => ({
      onDrop,
      canDrop,
    }),
    [onDrop, canDrop]
  );

  const t = useI18n();
  return (
    <ExplorerGroupEmpty
      className={clsx(styles.draggedOverHighlight, className)}
      ref={dropTargetRef}
      icon={FolderIcon}
      message={t['com.affine.rootAppSidebar.organize.empty-folder']()}
      messageTestId="slider-bar-organize-empty-message"
      actionText={t[
        'com.affine.rootAppSidebar.organize.empty-folder.add-pages'
      ]()}
      onActionClick={onClickCreate}
    />
  );
};
