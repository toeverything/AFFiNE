import { useState } from 'react';
import { useDrag, useDrop } from 'react-dnd';

import {
  StyledCollapse,
  StyledNodeLine,
  StyledTreeNodeContainer,
  StyledTreeNodeItem,
} from './styles';
import type { Node, NodeLIneProps, TreeNodeProps } from './types';

const NodeLine = <N,>({
  node,
  onDrop,
  allowDrop = true,
  isTop = false,
}: NodeLIneProps<N>) => {
  const [{ isOver }, drop] = useDrop(
    () => ({
      accept: 'node',
      drop: (item: Node<N>, monitor) => {
        const didDrop = monitor.didDrop();
        if (didDrop) {
          return;
        }
        onDrop?.(item, node, {
          internal: false,
          topLine: isTop,
          bottomLine: !isTop,
        });
      },
      collect: monitor => ({
        isOver: monitor.isOver(),
        canDrop: monitor.canDrop(),
      }),
    }),
    [onDrop]
  );

  return <StyledNodeLine ref={drop} show={isOver && allowDrop} isTop={isTop} />;
};

export const TreeNode = <N,>({
  node,
  index,
  allDrop = true,
  ...otherProps
}: TreeNodeProps<N>) => {
  const { onAdd, onDelete, onDrop } = otherProps;
  const [collapsed, setCollapsed] = useState(false);

  const [{ isDragging }, drag] = useDrag(() => ({
    type: 'node',
    item: node,
    collect: monitor => ({
      isDragging: monitor.isDragging(),
    }),
  }));

  const [{ canDrop, isOver }, drop] = useDrop(
    () => ({
      accept: 'node',
      drop: (item: Node<N>, monitor) => {
        const didDrop = monitor.didDrop();
        if (didDrop || item.id === node.id || !allDrop) {
          return;
        }
        onDrop?.(item, node, {
          internal: true,
          topLine: false,
          bottomLine: false,
        });
      },
      collect: monitor => ({
        isOver: monitor.isOver(),
        canDrop: monitor.canDrop(),
      }),
    }),
    [onDrop, allDrop]
  );

  return (
    <StyledTreeNodeContainer ref={drag} isDragging={isDragging}>
      <StyledTreeNodeItem
        ref={drop}
        isOver={isOver && !isDragging}
        canDrop={canDrop}
      >
        {index === 0 && (
          <NodeLine
            node={node}
            {...otherProps}
            allowDrop={!isDragging && allDrop}
            isTop={true}
          />
        )}
        {node.render?.(node, {
          onAdd: () => onAdd?.(node),
          onDelete: () => onDelete?.(node),
          collapsed,
          setCollapsed,
        })}
        {(!node.children?.length || collapsed) && (
          <NodeLine
            node={node}
            {...otherProps}
            allowDrop={!isDragging && allDrop}
          />
        )}
      </StyledTreeNodeItem>

      <StyledCollapse in={!collapsed}>
        {node.children &&
          node.children.map((childNode, index) => (
            <TreeNode
              key={childNode.id}
              node={childNode}
              index={index}
              allDrop={isDragging ? false : allDrop}
              {...otherProps}
            />
          ))}
      </StyledCollapse>
    </StyledTreeNodeContainer>
  );
};

export default TreeNode;
