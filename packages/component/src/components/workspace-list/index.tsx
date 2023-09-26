import type {
  AffineCloudWorkspace,
  LocalWorkspace,
} from '@affine/env/workspace';
import type { RootWorkspaceMetadata } from '@affine/workspace/atom';
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
import type { CSSProperties } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { WorkspaceCard } from '../../components/card/workspace-card';
import { workspaceItemStyle } from './index.css';

export interface WorkspaceListProps {
  disabled?: boolean;
  currentWorkspaceId: string | null;
  items: (AffineCloudWorkspace | LocalWorkspace)[];
  onClick: (workspaceId: string) => void;
  onSettingClick: (workspaceId: string) => void;
  onDragEnd: (event: DragEndEvent) => void;
}

interface SortableWorkspaceItemProps extends Omit<WorkspaceListProps, 'items'> {
  item: RootWorkspaceMetadata;
}

const SortableWorkspaceItem = (props: SortableWorkspaceItemProps) => {
  const { setNodeRef, attributes, listeners, transform, transition } =
    useSortable({
      id: props.item.id,
    });
  const style: CSSProperties = useMemo(
    () => ({
      transform: transform
        ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
        : undefined,
      transition,
      pointerEvents: props.disabled ? 'none' : undefined,
      opacity: props.disabled ? 0.6 : undefined,
    }),
    [props.disabled, transform, transition]
  );
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
        currentWorkspaceId={props.currentWorkspaceId}
        meta={props.item}
        onClick={props.onClick}
        onSettingClick={props.onSettingClick}
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
          <SortableWorkspaceItem {...props} item={item} key={item.id} />
        ))}
      </SortableContext>
    </DndContext>
  );
};
