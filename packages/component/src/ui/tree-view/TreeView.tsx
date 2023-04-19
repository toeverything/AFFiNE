import type {
  DragEndEvent} from '@dnd-kit/core';
import {
  closestCenter,
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors
} from '@dnd-kit/core';
import { useCallback, useState } from 'react';

import useCollapsed from './hooks/useCollapsed';
import useSelectWithKeyboard from './hooks/useSelectWithKeyboard';
import { TreeNode, TreeNodeWithDnd } from './TreeNode';
import type { TreeViewProps } from './types';
import { findNode } from './utils';
export const TreeView = <RenderProps,>({
  data,
  enableKeyboardSelection,
  onSelect,
  enableDnd = true,
  initialCollapsedIds = [],
  disableCollapse,
  onDrop,
  ...otherProps
}: TreeViewProps<RenderProps>) => {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );
  const { selectedId } = useSelectWithKeyboard({
    data,
    onSelect,
    enableKeyboardSelection,
  });

  const { collapsedIds, setCollapsed } = useCollapsed({ disableCollapse });

  const [draggingId, setDraggingId] = useState<string>();

  const onDragEnd = useCallback(
    (e: DragEndEvent) => {
      const { active, over } = e;
      const position = over?.data.current?.position;
      const dropId = over?.data.current?.node.id;

      if (!over || !active || !position) {
        return;
      }

      onDrop?.(active.id as string, dropId, position);
    },
    [onDrop]
  );
  const onDragMove = useCallback((e: DragEndEvent) => {
    setDraggingId(e.active.id as string);
  }, []);
  if (enableDnd) {
    return (
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragMove={onDragMove}
        onDragEnd={onDragEnd}
      >
        {data.map((node, index) => (
          <TreeNodeWithDnd
            key={node.id}
            index={index}
            collapsedIds={collapsedIds}
            setCollapsed={setCollapsed}
            node={node}
            selectedId={selectedId}
            enableDnd={enableDnd}
            disableCollapse={disableCollapse}
            draggingId={draggingId}
            {...otherProps}
          />
        ))}

        <DragOverlay>
          {draggingId && (
            <TreeNode
              node={findNode(draggingId, data)!}
              index={0}
              allowDrop={false}
              collapsedIds={collapsedIds}
              setCollapsed={() => {}}
              {...otherProps}
            />
          )}
        </DragOverlay>
      </DndContext>
    );
  }

  return (
    <>
      {data.map((node, index) => (
        <TreeNode
          key={node.id}
          index={index}
          collapsedIds={collapsedIds}
          setCollapsed={setCollapsed}
          node={node}
          selectedId={selectedId}
          enableDnd={enableDnd}
          disableCollapse={disableCollapse}
          {...otherProps}
        />
      ))}
    </>
  );
};

export default TreeView;
