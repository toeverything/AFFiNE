import { useState } from 'react';
import { useDrag, useDrop } from 'react-dnd';

import {
  StyledCollapse,
  StyledNodeLine,
  StyledTreeNodeContainer,
  StyledTreeNodeItem,
} from './styles';
import type { Node, NodeLIneProps, TreeNodeProps } from './types';

const NodeLine = <N,>({ node, onDrop, allowDrop = true }: NodeLIneProps<N>) => {
  const [{ isOver }, drop] = useDrop(
    () => ({
      accept: 'node',
      drop: (item: Node<N>, monitor) => {
        const didDrop = monitor.didDrop();
        if (didDrop) {
          return;
        }
        onDrop?.(item, node, true);
      },
      collect: monitor => ({
        isOver: monitor.isOver(),
        canDrop: monitor.canDrop() && allowDrop,
      }),
    }),
    [onDrop]
  );

  return <StyledNodeLine ref={drop} show={isOver && allowDrop} />;
};

export const TreeNode = <N,>({ node, ...otherProps }: TreeNodeProps<N>) => {
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
        if (didDrop || item.id === node.id) {
          return;
        }
        onDrop?.(item, node, false);
      },
      collect: monitor => ({
        isOver: monitor.isOver(),
        canDrop: monitor.canDrop(),
      }),
    }),
    [onDrop]
  );

  return (
    <>
      <StyledTreeNodeContainer
        ref={drop}
        isOver={isOver && !isDragging}
        canDrop={canDrop}
      >
        <StyledTreeNodeItem ref={drag} isDragging={isDragging}>
          {node.render?.(node, {
            onAdd: () => onAdd?.(node),
            onDelete: () => onDelete?.(node),
            collapsed,
            setCollapsed,
          })}
        </StyledTreeNodeItem>
        {(!node.children?.length || collapsed) && (
          <NodeLine node={node} {...otherProps} allowDrop={!isDragging} />
        )}
      </StyledTreeNodeContainer>

      <StyledCollapse in={!collapsed}>
        {node.children &&
          node.children.map(childNode => (
            <TreeNode key={childNode.id} node={childNode} {...otherProps} />
          ))}
      </StyledCollapse>
    </>
  );
};

export default TreeNode;
