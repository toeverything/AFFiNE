import { useDroppable } from '@dnd-kit/core';

import { StyledNodeLine } from './styles';
import type { NodeLIneProps, TreeNodeItemProps } from './types';

export const NodeLine = <RenderProps,>({
  node,
  allowDrop = true,
  isTop = false,
}: NodeLIneProps<RenderProps>) => {
  const { isOver, setNodeRef } = useDroppable({
    id: `${node.id}-${isTop ? 'top' : 'bottom'}-line`,
    disabled: !allowDrop,
    data: {
      node,
      position: {
        topLine: isTop,
        bottomLine: !isTop,
        internal: false,
      },
    },
  });

  return (
    <StyledNodeLine
      ref={setNodeRef}
      isOver={isOver && allowDrop}
      isTop={isTop}
    />
  );
};
export const TreeNodeItemWithDnd = <RenderProps,>({
  node,
  allowDrop,
  setCollapsed,
  ...otherProps
}: TreeNodeItemProps<RenderProps>) => {
  const { onAdd, onDelete } = otherProps;

  const { isOver, setNodeRef } = useDroppable({
    id: node.id,
    disabled: !allowDrop,
    data: {
      node,
      position: {
        topLine: false,
        bottomLine: false,
        internal: true,
      },
    },
  });

  return (
    <div ref={setNodeRef}>
      <TreeNodeItem
        onAdd={onAdd}
        onDelete={onDelete}
        node={node}
        allowDrop={allowDrop}
        setCollapsed={setCollapsed}
        isOver={isOver}
        {...otherProps}
      />
    </div>
  );
};

export const TreeNodeItem = <RenderProps,>({
  node,
  collapsed,
  setCollapsed,
  selectedId,
  isOver = false,
  onAdd,
  onDelete,
  disableCollapse,
  allowDrop = true,
}: TreeNodeItemProps<RenderProps>) => {
  return (
    <>
      {node.render?.(node, {
        isOver: isOver && allowDrop,
        onAdd: () => onAdd?.(node.id),
        onDelete: () => onDelete?.(node.id),
        collapsed,
        setCollapsed,
        isSelected: selectedId === node.id,
        disableCollapse,
      })}
    </>
  );
};
