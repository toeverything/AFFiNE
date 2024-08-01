import {
  type DropTargetDropEvent,
  type DropTargetOptions,
  useDropTarget,
} from '@affine/component';
import type { AffineDNDData } from '@affine/core/types/dnd';
import { useI18n } from '@affine/i18n';
import { FavoriteIcon } from '@blocksuite/icons/rc';

import { ExplorerEmptySection } from '../../layouts/empty-section';
import { DropEffect, type ExplorerTreeNodeDropEffect } from '../../tree';

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
          at: 'explorer:favorite:root',
        },
        onDrop: onDrop,
        canDrop: canDrop,
      }),
      [onDrop, canDrop]
    );

  return (
    <ExplorerEmptySection
      ref={dropTargetRef}
      icon={FavoriteIcon}
      message={t['com.affine.rootAppSidebar.favorites.empty']()}
      messageTestId="slider-bar-favorites-empty-message"
    >
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
    </ExplorerEmptySection>
  );
};
