import {
  AnimatedFolderIcon,
  type DropTargetDropEvent,
  Skeleton,
  useDropTarget,
} from '@affine/component';
import type { AffineDNDData } from '@affine/core/types/dnd';
import { useI18n } from '@affine/i18n';

import { ExplorerEmptySection } from '../../layouts/empty-section';
import { DropEffect } from '../../tree';
import { organizeEmptyDropEffect, organizeEmptyRootCanDrop } from './dnd';

interface RootEmptyProps {
  onClickCreate?: () => void;
  isLoading?: boolean;
  onDrop?: (data: DropTargetDropEvent<AffineDNDData>) => void;
}

export const RootEmptyLoading = () => {
  return <Skeleton />;
};

export const RootEmptyReady = ({
  onClickCreate,
  onDrop,
}: Omit<RootEmptyProps, 'isLoading'>) => {
  const t = useI18n();

  const { dropTargetRef, draggedOverDraggable, draggedOverPosition } =
    useDropTarget<AffineDNDData>(
      () => ({
        data: { at: 'explorer:organize:root' },
        onDrop,
        canDrop: organizeEmptyRootCanDrop,
      }),
      [onDrop]
    );

  return (
    <ExplorerEmptySection
      ref={dropTargetRef}
      icon={<AnimatedFolderIcon open={!!draggedOverDraggable} />}
      message={t['com.affine.rootAppSidebar.organize.empty']()}
      messageTestId="slider-bar-organize-empty-message"
      actionText={t[
        'com.affine.rootAppSidebar.organize.empty.new-folders-button'
      ]()}
      onActionClick={onClickCreate}
    >
      {draggedOverDraggable && (
        <DropEffect
          position={draggedOverPosition}
          dropEffect={organizeEmptyDropEffect({
            source: draggedOverDraggable,
            treeInstruction: null,
          })}
        />
      )}
    </ExplorerEmptySection>
  );
};

export const RootEmpty = ({ isLoading, ...props }: RootEmptyProps) => {
  return isLoading ? <RootEmptyLoading /> : <RootEmptyReady {...props} />;
};
