import type { DragEndEvent } from '@dnd-kit/core';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  restrictToParentElement,
  restrictToVerticalAxis,
} from '@dnd-kit/modifiers';
import { arrayMove, SortableContext, useSortable } from '@dnd-kit/sortable';
import type { WorkspaceMetadata } from '@toeverything/infra';
import type { CSSProperties } from 'react';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';

import {
  WorkspaceCard,
  WorkspaceCardSkeleton,
} from '../../components/card/workspace-card';
import { workspaceItemStyle } from './index.css';

export interface WorkspaceListProps {
  disabled?: boolean;
  currentWorkspaceId?: string | null;
  items: WorkspaceMetadata[];
  onClick: (workspace: WorkspaceMetadata) => void;
  onSettingClick: (workspace: WorkspaceMetadata) => void;
  onDragEnd: (event: DragEndEvent) => void;
  useIsWorkspaceOwner: (workspaceMetadata: WorkspaceMetadata) => boolean;
  useWorkspaceAvatar: (
    workspaceMetadata: WorkspaceMetadata
  ) => string | undefined;
  useWorkspaceName: (
    workspaceMetadata: WorkspaceMetadata
  ) => string | undefined;
}

interface SortableWorkspaceItemProps extends Omit<WorkspaceListProps, 'items'> {
  item: WorkspaceMetadata;
}

const SortableWorkspaceItem = ({
  disabled,
  item,
  useIsWorkspaceOwner,
  useWorkspaceAvatar,
  useWorkspaceName,
  currentWorkspaceId,
  onClick,
  onSettingClick,
}: SortableWorkspaceItemProps) => {
  const { setNodeRef, attributes, listeners, transform, transition } =
    useSortable({
      id: item.id,
    });
  const style: CSSProperties = useMemo(
    () => ({
      transform: transform
        ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
        : undefined,
      transition,
      pointerEvents: disabled ? 'none' : undefined,
      opacity: disabled ? 0.6 : undefined,
    }),
    [disabled, transform, transition]
  );
  const isOwner = useIsWorkspaceOwner?.(item);
  const avatar = useWorkspaceAvatar?.(item);
  const name = useWorkspaceName?.(item);
  return (
    <div
      className={workspaceItemStyle}
      data-testid="draggable-item"
      style={style}
      ref={setNodeRef}
      {...attributes}
      {...listeners}
    >
      <WorkspaceCard
        currentWorkspaceId={currentWorkspaceId}
        meta={item}
        onClick={onClick}
        onSettingClick={onSettingClick}
        isOwner={isOwner}
        name={name}
        avatar={avatar}
      />
    </div>
  );
};

const modifiers = [restrictToParentElement, restrictToVerticalAxis];

export const WorkspaceList = (props: WorkspaceListProps) => {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );
  const workspaceList = props.items;
  const [optimisticList, setOptimisticList] = useState(workspaceList);

  useEffect(() => {
    setOptimisticList(workspaceList);
  }, [workspaceList]);

  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (active.id !== over?.id) {
        setOptimisticList(workspaceList => {
          const oldIndex = workspaceList.findIndex(w => w.id === active.id);
          const newIndex = workspaceList.findIndex(w => w.id === over?.id);
          const newList = arrayMove(workspaceList, oldIndex, newIndex);
          return newList;
        });
        props.onDragEnd(event);
      }
    },
    [props]
  );

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd} modifiers={modifiers}>
      <SortableContext items={optimisticList}>
        {optimisticList.map(item => (
          <Suspense fallback={<WorkspaceCardSkeleton />} key={item.id}>
            <SortableWorkspaceItem key={item.id} {...props} item={item} />
          </Suspense>
        ))}
      </SortableContext>
    </DndContext>
  );
};
