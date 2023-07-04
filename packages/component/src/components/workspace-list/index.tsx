import type {
  AffineCloudWorkspace,
  LocalWorkspace,
} from '@affine/env/workspace';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { SortableContext, useSortable } from '@dnd-kit/sortable';
import type { FC } from 'react';

import { WorkspaceCard } from '../../components/card/workspace-card';
import { workspaceItemStyle } from './index.css';

export type WorkspaceListProps = {
  disabled?: boolean;
  currentWorkspaceId: string | null;
  items: (AffineCloudWorkspace | LocalWorkspace)[];
  onClick: (workspace: AffineCloudWorkspace | LocalWorkspace) => void;
  onSettingClick: (workspace: AffineCloudWorkspace | LocalWorkspace) => void;
  onDragEnd: (event: DragEndEvent) => void;
};

const SortableWorkspaceItem: FC<
  Omit<WorkspaceListProps, 'items'> & {
    item: AffineCloudWorkspace | LocalWorkspace;
  }
> = props => {
  const { setNodeRef, attributes, listeners, transform } = useSortable({
    id: props.item.id,
  });
  const style: React.CSSProperties = {
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
      : undefined,
    pointerEvents: props.disabled ? 'none' : undefined,
    opacity: props.disabled ? 0.6 : undefined,
  };
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
        workspace={props.item}
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
