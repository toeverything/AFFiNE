import { useEffect, useState } from 'react';
import { useDrag, useDrop } from 'react-dnd';

import {
  StyledCollapse,
  StyledNodeLine,
  StyledTreeNodeContainer,
  StyledTreeNodeWrapper,
} from './styles';
import type {
  Node,
  NodeLIneProps,
  TreeNodeItemProps,
  TreeNodeProps,
} from './types';

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
const TreeNodeItem = <N,>({
  node,
  allowDrop,
  collapsed,
  setCollapsed,
  ...otherProps
}: TreeNodeItemProps<N>) => {
  const { onAdd, onDelete, onDrop } = otherProps;

  const [{ canDrop, isOver }, drop] = useDrop(
    () => ({
      accept: 'node',
      drop: (item: Node<N>, monitor) => {
        const didDrop = monitor.didDrop();
        if (didDrop || item.id === node.id || !allowDrop) {
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
        canDrop: monitor.canDrop() && allowDrop,
      }),
    }),
    [onDrop, allowDrop]
  );

  useEffect(() => {
    if (isOver && canDrop) {
      setCollapsed(false);
    }
  }, [isOver, canDrop]);

  return (
    <div ref={drop}>
      {node.render?.(node, {
        isOver: !!(isOver && canDrop),
        onAdd: () => onAdd?.(node),
        onDelete: () => onDelete?.(node),
        collapsed,
        setCollapsed,
      })}
    </div>
  );
};

export const TreeNode = <N,>({
  node,
  index,
  allowDrop = true,
  ...otherProps
}: TreeNodeProps<N>) => {
  const { indent } = otherProps;
  const [collapsed, setCollapsed] = useState(false);

  const [{ isDragging }, drag] = useDrag(() => ({
    type: 'node',
    item: node,
    collect: monitor => ({
      isDragging: monitor.isDragging(),
    }),
  }));

  return (
    <StyledTreeNodeContainer ref={drag} isDragging={isDragging}>
      <StyledTreeNodeWrapper>
        {index === 0 && (
          <NodeLine
            node={node}
            {...otherProps}
            allowDrop={!isDragging && allowDrop}
            isTop={true}
          />
        )}
        <TreeNodeItem
          node={node}
          index={index}
          allowDrop={allowDrop}
          collapsed={collapsed}
          setCollapsed={setCollapsed}
          {...otherProps}
        />
        {(!node.children?.length || collapsed) && (
          <NodeLine
            node={node}
            {...otherProps}
            allowDrop={!isDragging && allowDrop}
          />
        )}
      </StyledTreeNodeWrapper>
      <StyledCollapse in={!collapsed} indent={indent}>
        {node.children &&
          node.children.map((childNode, index) => (
            <TreeNode
              key={childNode.id}
              node={childNode}
              index={index}
              allowDrop={isDragging ? false : allowDrop}
              {...otherProps}
            />
          ))}
      </StyledCollapse>
    </StyledTreeNodeContainer>
  );
};

export default TreeNode;
