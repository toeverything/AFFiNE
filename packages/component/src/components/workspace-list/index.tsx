import type { AffineWorkspace, LocalWorkspace } from '@affine/workspace/type';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { SortableContext, useSortable } from '@dnd-kit/sortable';
import type { Atom } from 'jotai';
import { useAtomValue } from 'jotai';
import type { FC } from 'react';
import { Suspense } from 'react';

import { WorkspaceCard } from '../workspace-card';

export type WorkspaceListProps = {
  disabled?: boolean;
  currentWorkspaceId: string | null;
  getWorkspaceAtom: (
    id: string
  ) => Atom<Promise<AffineWorkspace | LocalWorkspace | null>>;
  items: string[];
  onClick: (workspace: AffineWorkspace | LocalWorkspace) => void;
  onSettingClick: (workspace: AffineWorkspace | LocalWorkspace) => void;
  onDragEnd: (event: DragEndEvent) => void;
};

const SortableWorkspaceItem: FC<
  Omit<WorkspaceListProps, 'items'> & {
    item: string;
  }
> = props => {
  const { setNodeRef, attributes, listeners, transform } = useSortable({
    id: props.item,
  });
  const style: React.CSSProperties = {
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
      : undefined,
    pointerEvents: props.disabled ? 'none' : undefined,
    opacity: props.disabled ? 0.6 : undefined,
  };
  const atom = props.getWorkspaceAtom(props.item);
  const workspace = useAtomValue(atom);
  return (
    <div
      data-testid="draggable-item"
      style={style}
      ref={setNodeRef}
      {...attributes}
      {...listeners}
    >
      <WorkspaceCard
        currentWorkspaceId={props.currentWorkspaceId}
        workspace={workspace}
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
          <Suspense key={item} fallback={<WorkspaceCard {...props} />}>
            <SortableWorkspaceItem {...props} item={item} />
          </Suspense>
        ))}
      </SortableContext>
    </DndContext>
  );
};
