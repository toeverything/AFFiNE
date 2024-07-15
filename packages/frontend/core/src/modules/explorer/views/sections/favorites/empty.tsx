import {
  type DropTargetDropEvent,
  type DropTargetOptions,
  useDropTarget,
} from '@affine/component';
import type { AffineDNDData } from '@affine/core/types/dnd';
import { useI18n } from '@affine/i18n';
import { FolderIcon } from '@blocksuite/icons/rc';

import { DropEffect, type ExplorerTreeNodeDropEffect } from '../../tree';
import * as styles from './empty.css';

export const RootEmpty = ({
  onDrop,
  canDrop,
  dropEffect,
}: {
  onDrop?: (data: DropTargetDropEvent<AffineDNDData>) => void;
  canDrop?: DropTargetOptions<AffineDNDData>['canDrop'];
  dropEffect?: ExplorerTreeNodeDropEffect;
}) => {
  const t = useI18n();

  const { dropTargetRef, draggedOverDraggable, draggedOverPosition } =
    useDropTarget<AffineDNDData>(
      () => ({
        data: {
          at: 'explorer:organize:root',
        },
        onDrop: onDrop,
        canDrop: canDrop,
      }),
      [onDrop, canDrop]
    );

  return (
    <div className={styles.content} ref={dropTargetRef}>
      <div className={styles.iconWrapper}>
        <FolderIcon className={styles.icon} />
      </div>
      <div
        data-testid="slider-bar-organize-empty-message"
        className={styles.message}
      >
        {t['com.affine.rootAppSidebar.organize.empty']()}
      </div>
      {dropEffect && draggedOverDraggable && (
        <DropEffect
          position={{
            x: draggedOverPosition.relativeX,
            y: draggedOverPosition.relativeY,
          }}
          dropEffect={dropEffect({
            source: draggedOverDraggable,
            treeInstruction: null,
          })}
        />
      )}
    </div>
  );
};
