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
import { SortableContext, useSortable } from '@dnd-kit/sortable';
import type { CSSProperties, FC } from 'react';
import { useMemo } from 'react';

import { WorkspaceCard } from '../../components/card/workspace-card';
import { workspaceItemStyle } from './index.css';

export type WorkspaceListProps = {
  disabled?: boolean;
  currentWorkspaceId: string | null;
  items: (AffineCloudWorkspace | LocalWorkspace)[];
  onClick: (workspaceId: string) => void;
  onSettingClick: (workspaceId: string) => void;
  onDragEnd: (event: DragEndEvent) => void;
};

const SortableWorkspaceItem: FC<
  Omit<WorkspaceListProps, 'items'> & {
    item: RootWorkspaceMetadata;
  }
> = props => {
  const { setNodeRef, attributes, listeners, transform } = useSortable({
    id: props.item.id,
  });
  const style: CSSProperties = useMemo(
    () => ({
      transform: transform
        ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
        : undefined,
      pointerEvents: props.disabled ? 'none' : undefined,
      opacity: props.disabled ? 0.6 : undefined,
    }),
    [props.disabled, transform]
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

export const WorkspaceList: FC<WorkspaceListProps> = props => {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );
  return (
    <DndContext sensors={sensors} onDragEnd={props.onDragEnd}>
      <SortableContext items={props.items}>
        {props.items.map(item => (
          <SortableWorkspaceItem {...props} item={item} key={item.id} />
        ))}
      </SortableContext>
    </DndContext>
  );
};
