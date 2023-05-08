import { useDraggable } from '@dnd-kit/core';
import { useMemo } from 'react';

import {
  StyledCollapse,
  StyledTreeNodeContainer,
  StyledTreeNodeWrapper,
} from './styles';
import { NodeLine, TreeNodeItem, TreeNodeItemWithDnd } from './tree-node-inner';
import type { TreeNodeProps } from './types';
export const TreeNodeWithDnd = <RenderProps,>(
  props: TreeNodeProps<RenderProps>
) => {
  const { draggingId, node, allowDrop } = props;
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: props.node.id,
  });
  const isDragging = useMemo(
    () => draggingId === node.id,
    [draggingId, node.id]
  );
  return (
    <StyledTreeNodeContainer
      ref={setNodeRef}
      isDragging={isDragging}
      {...listeners}
      {...attributes}
    >
      <TreeNode
        {...props}
        allowDrop={allowDrop === false ? allowDrop : !isDragging}
      />
    </StyledTreeNodeContainer>
  );
};

export const TreeNode = <RenderProps,>({
  node,
  index,
  allowDrop = true,
  ...otherProps
}: TreeNodeProps<RenderProps>) => {
  const { indent, enableDnd, collapsedIds } = otherProps;
  const collapsed = collapsedIds.includes(node.id);
  const { renderTopLine = true, renderBottomLine = true } = node;

  return (
    <>
      <StyledTreeNodeWrapper>
        {enableDnd && renderTopLine && index === 0 && (
          <NodeLine
            node={node}
            {...otherProps}
            allowDrop={allowDrop}
            isTop={true}
          />
        )}
        {enableDnd ? (
          <TreeNodeItemWithDnd
            node={node}
            index={index}
            allowDrop={allowDrop}
            collapsed={collapsed}
            {...otherProps}
          />
        ) : (
          <TreeNodeItem
            node={node}
            index={index}
            allowDrop={allowDrop}
            collapsed={collapsed}
            {...otherProps}
          />
        )}

        {enableDnd &&
          renderBottomLine &&
          (!node.children?.length || collapsed) && (
            <NodeLine node={node} {...otherProps} allowDrop={allowDrop} />
          )}
      </StyledTreeNodeWrapper>
      <StyledCollapse in={!collapsed} indent={indent}>
        {node.children &&
          node.children.map((childNode, index) =>
            enableDnd ? (
              <TreeNodeWithDnd
                key={childNode.id}
                node={childNode}
                index={index}
                {...otherProps}
                allowDrop={allowDrop}
              />
            ) : (
              <TreeNode
                key={childNode.id}
                node={childNode}
                index={index}
                allowDrop={false}
                {...otherProps}
              />
            )
          )}
      </StyledCollapse>
    </>
  );
};
