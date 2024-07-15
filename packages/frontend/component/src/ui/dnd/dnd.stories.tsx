import type { Meta, StoryFn } from '@storybook/react';
import { cssVar } from '@toeverything/theme';
import { cloneDeep } from 'lodash-es';
import { useCallback, useState } from 'react';

import {
  type DNDData,
  DropIndicator,
  type DropTargetDropEvent,
  type DropTargetOptions,
  useDraggable,
  useDropTarget,
} from './index';

export default {
  title: 'UI/Dnd',
} satisfies Meta;

export const Draggable: StoryFn<{
  canDrag: boolean;
  disableDragPreview: boolean;
}> = ({ canDrag, disableDragPreview }) => {
  const { dragRef } = useDraggable(
    () => ({
      canDrag,
      disableDragPreview,
    }),
    [canDrag, disableDragPreview]
  );
  return (
    <div>
      <style>
        {`.draggable[data-dragging='true'] {
          opacity: 0.3;
        }`}
      </style>
      <div className="draggable" ref={dragRef}>
        Drag here
      </div>
    </div>
  );
};
Draggable.args = {
  canDrag: true,
  disableDragPreview: false,
};

export const DraggableCustomPreview: StoryFn = () => {
  const { dragRef, CustomDragPreview } = useDraggable(() => ({}), []);
  return (
    <div>
      <div ref={dragRef}>Drag here</div>
      <CustomDragPreview>
        <div>Dragging🤌</div>
      </CustomDragPreview>
    </div>
  );
};

export const DraggableControlledPreview: StoryFn = () => {
  const { dragRef, draggingPosition } = useDraggable(
    () => ({
      disableDragPreview: true,
    }),
    []
  );
  return (
    <div>
      <div
        ref={dragRef}
        style={{
          transform: `translate(${draggingPosition.offsetX}px, 0px)`,
        }}
      >
        Drag here
      </div>
    </div>
  );
};

export const DropTarget: StoryFn<{ canDrop: boolean }> = ({ canDrop }) => {
  const [dropData, setDropData] = useState<string>('');
  const { dragRef } = useDraggable(
    () => ({
      data: { text: 'hello' },
    }),
    []
  );
  const { dropTargetRef } = useDropTarget(
    () => ({
      canDrop,
      onDrop(data) {
        setDropData(prev => prev + data.source.data.text);
      },
    }),
    [canDrop]
  );
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
      }}
    >
      <style>
        {`
        .drop-target {
          width: 100px;
          height: 100px;
          text-align: center;
          border: 2px solid red;
        }
        .drop-target[data-dragged-over='true'] {
          border: 2px solid green;
        }`}
      </style>
      <div ref={dragRef}>👉 hello</div>
      <div className="drop-target" ref={dropTargetRef}>
        {dropData || 'Drop here'}
      </div>
    </div>
  );
};
DropTarget.args = {
  canDrop: true,
};

const DropList = ({ children }: { children?: React.ReactNode }) => {
  const [dropData, setDropData] = useState<string[]>([]);
  const { dropTargetRef, draggedOver } = useDropTarget<
    DNDData<{ text: string }>
  >(
    () => ({
      onDrop(data) {
        setDropData(prev => [...prev, data.source.data.text]);
      },
    }),
    []
  );
  return (
    <ul style={{ padding: '20px' }} ref={dropTargetRef}>
      <li>Append here{draggedOver && ' [dragged-over]'}</li>
      {dropData.map((text, i) => (
        <li key={i}>{text}</li>
      ))}
      {children}
    </ul>
  );
};

export const NestedDropTarget: StoryFn<{ canDrop: boolean }> = () => {
  const { dragRef } = useDraggable(
    () => ({
      data: { text: 'hello' },
    }),
    []
  );
  return (
    <div>
      <div ref={dragRef}>👉 hello</div>
      <br />
      <ul>
        <DropList>
          <DropList>
            <DropList></DropList>
          </DropList>
        </DropList>
      </ul>
    </div>
  );
};
NestedDropTarget.args = {
  canDrop: true,
};

export const DynamicDragPreview = () => {
  type DataType = DNDData<
    Record<string, never>,
    { type: 'big' | 'small' | 'tips' }
  >;
  const { dragRef, dragging, draggingPosition, dropTarget, CustomDragPreview } =
    useDraggable<DataType>(() => ({}), []);
  const { dropTargetRef: bigDropTargetRef } = useDropTarget<DataType>(
    () => ({
      data: { type: 'big' },
    }),
    []
  );
  const { dropTargetRef: smallDropTargetRef } = useDropTarget<DataType>(
    () => ({
      data: { type: 'small' },
    }),
    []
  );
  const {
    dropTargetRef: tipsDropTargetRef,
    draggedOver: tipsDraggedOver,
    draggedOverPosition: tipsDraggedOverPosition,
  } = useDropTarget<DataType>(
    () => ({
      data: { type: 'tips' },
    }),
    []
  );
  return (
    <div
      style={{
        display: 'flex',
        margin: '0 auto',
        width: '600px',
        border: '3px solid red',
        flexWrap: 'wrap',
        padding: '8px',
      }}
    >
      <div
        ref={dragRef}
        style={{
          padding: '10px',
          border: '1px solid blue',
          transform: `${dropTarget.length > 0 ? `translate(${draggingPosition.offsetX}px, ${draggingPosition.offsetY}px)` : `translate(${draggingPosition.offsetX}px, 0px)`}
          ${dropTarget.some(t => t.data.type === 'big') ? 'scale(1.5)' : dropTarget.some(t => t.data.type === 'small') ? 'scale(0.5)' : ''}
          ${draggingPosition.outWindow ? 'scale(0.0)' : ''}`,
          opacity: draggingPosition.outWindow ? 0.2 : 1,
          pointerEvents: dragging ? 'none' : 'auto',
          transition: 'transform 50ms, opacity 200ms',
          marginBottom: '100px',
          willChange: 'transform',
          background: cssVar('--affine-background-primary-color'),
        }}
      >
        👉 drag here
      </div>
      <div
        ref={bigDropTargetRef}
        style={{
          width: '100%',
          border: '1px solid green',
          height: '100px',
          fontSize: '50px',
        }}
      >
        Big
      </div>
      <div
        ref={smallDropTargetRef}
        style={{
          width: '100%',
          border: '1px solid green',
          height: '100px',
          fontSize: '50px',
        }}
      >
        Small
      </div>
      <div
        ref={tipsDropTargetRef}
        style={{
          position: 'relative',
          width: '100%',
          border: '1px solid green',
          height: '100px',
          fontSize: '50px',
        }}
      >
        Tips
        {tipsDraggedOver && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              transform: `translate(${tipsDraggedOverPosition.relativeX}px, ${tipsDraggedOverPosition.relativeY}px)`,
            }}
          >
            tips
          </div>
        )}
      </div>
      <CustomDragPreview position="pointer-outside">
        <div
          style={{
            background: 'rgba(0, 0, 0, 0.1)',
            borderRadius: '5px',
            padding: '2px 6px',
          }}
        >
          👋 this is a record
        </div>
      </CustomDragPreview>
    </div>
  );
};

const ReorderableListItem = ({
  id,
  onDrop,
  orientation,
}: {
  id: string;
  onDrop: DropTargetOptions['onDrop'];
  orientation: 'horizontal' | 'vertical';
}) => {
  const { dropTargetRef, closestEdge } = useDropTarget(
    () => ({
      isSticky: true,
      closestEdge: {
        allowedEdges:
          orientation === 'vertical' ? ['top', 'bottom'] : ['left', 'right'],
      },
      onDrop,
    }),
    [onDrop, orientation]
  );
  const { dragRef } = useDraggable(
    () => ({
      data: { id },
    }),
    [id]
  );

  return (
    <div
      ref={node => {
        dropTargetRef.current = node;
        dragRef.current = node;
      }}
      style={{
        position: 'relative',
        padding: '10px',
        border: '1px solid black',
      }}
    >
      Item {id}
      <DropIndicator edge={closestEdge} />
    </div>
  );
};

export const ReorderableList: StoryFn<{
  orientation: 'horizontal' | 'vertical';
}> = ({ orientation }) => {
  const [items, setItems] = useState<string[]>(['A', 'B', 'C']);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: orientation === 'horizontal' ? 'row' : 'column',
      }}
    >
      {items.map((item, i) => (
        <ReorderableListItem
          key={i}
          id={item}
          orientation={orientation}
          onDrop={data => {
            const dropId = data.source.data.id as string;
            if (dropId === item) {
              return;
            }
            const closestEdge = data.closestEdge;
            if (!closestEdge) {
              return;
            }
            const newItems = items.filter(i => i !== dropId);
            const newPosition = newItems.findIndex(i => i === item);
            newItems.splice(
              closestEdge === 'bottom' || closestEdge === 'right'
                ? newPosition + 1
                : newPosition,
              0,
              dropId
            );
            setItems(newItems);
          }}
        />
      ))}
    </div>
  );
};
ReorderableList.argTypes = {
  orientation: {
    type: {
      name: 'enum',
      value: ['horizontal', 'vertical'],
      required: true,
    },
  },
};
ReorderableList.args = {
  orientation: 'vertical',
};

interface Node {
  id: string;
  children: Node[];
  leaf?: boolean;
}

const ReorderableTreeNode = ({
  level,
  node,
  onDrop,
  isLastInGroup,
}: {
  level: number;
  node: Node;
  onDrop: (
    data: DropTargetDropEvent<DNDData<{ node: Node }>> & {
      dropAt: Node;
    }
  ) => void;
  isLastInGroup: boolean;
}) => {
  const [expanded, setExpanded] = useState<boolean>(true);
  const { dragRef, dragging } = useDraggable(
    () => ({
      data: { node },
    }),
    [node]
  );

  const { dropTargetRef, treeInstruction } = useDropTarget<
    DNDData<{
      node: Node;
    }>
  >(
    () => ({
      isSticky: true,
      treeInstruction: {
        mode:
          expanded && !node.leaf
            ? 'expanded'
            : isLastInGroup
              ? 'last-in-group'
              : 'standard',
        block: node.leaf ? ['make-child'] : [],
        currentLevel: level,
        indentPerLevel: 20,
      },
      onDrop: data => {
        onDrop({ ...data, dropAt: node });
      },
    }),
    [onDrop, expanded, isLastInGroup, level, node]
  );

  return (
    <>
      <div
        ref={node => {
          dropTargetRef.current = node;
          dragRef.current = node;
        }}
        style={{
          paddingLeft: level * 20,
          position: 'relative',
        }}
      >
        <span onClick={() => setExpanded(prev => !prev)}>
          {node.leaf ? '📃 ' : expanded ? '📂 ' : '📁 '}
        </span>
        {node.id}
        <DropIndicator instruction={treeInstruction} />
      </div>
      {expanded &&
        !dragging &&
        node.children.map((child, i) => (
          <ReorderableTreeNode
            key={child.id}
            level={level + 1}
            isLastInGroup={i === node.children.length - 1}
            node={child}
            onDrop={onDrop}
          />
        ))}
    </>
  );
};

export const ReorderableTree: StoryFn = () => {
  const [tree, setTree] = useState<Node>({
    id: 'root',
    children: [
      {
        id: 'a',
        children: [],
      },
      {
        id: 'b',
        children: [
          {
            id: 'c',
            children: [],
            leaf: true,
          },
          {
            id: 'd',
            children: [],
            leaf: true,
          },
          {
            id: 'e',
            children: [
              {
                id: 'f',
                children: [],
                leaf: true,
              },
            ],
          },
        ],
      },
    ],
  });

  const handleDrop = useCallback(
    (
      data: DropTargetDropEvent<DNDData<{ node: Node }>> & {
        dropAt: Node;
      }
    ) => {
      const clonedTree = cloneDeep(tree);

      const findNode = (
        node: Node,
        id: string
      ): { parent: Node; index: number; node: Node } | null => {
        if (node.id === id) {
          return { parent: node, index: -1, node };
        }
        for (let i = 0; i < node.children.length; i++) {
          if (node.children[i].id === id) {
            return { parent: node, index: i, node: node.children[i] };
          }
          const result = findNode(node.children[i], id);
          if (result) {
            return result;
          }
        }
        return null;
      };

      const nodePosition = findNode(clonedTree, data.source.data.node.id)!;
      const dropAtPosition = findNode(clonedTree, data.dropAt.id)!;

      // delete the node from the tree
      nodePosition.parent.children.splice(nodePosition.index, 1);

      if (data.treeInstruction) {
        if (data.treeInstruction.type === 'make-child') {
          if (dropAtPosition.node.leaf) {
            return;
          }
          if (nodePosition.node.id === dropAtPosition.node.id) {
            return;
          }
          dropAtPosition.node.children.splice(0, 0, nodePosition.node);
        } else if (data.treeInstruction.type === 'reparent') {
          const up =
            data.treeInstruction.currentLevel -
            data.treeInstruction.desiredLevel -
            1;

          let parentPosition = findNode(clonedTree, dropAtPosition.parent.id)!;
          for (let i = 0; i < up; i++) {
            parentPosition = findNode(clonedTree, parentPosition.parent.id)!;
          }
          parentPosition.parent.children.splice(
            parentPosition.index + 1,
            0,
            nodePosition.node
          );
        } else if (data.treeInstruction.type === 'reorder-above') {
          if (dropAtPosition.node.id === 'root') {
            return;
          }
          dropAtPosition.parent.children.splice(
            dropAtPosition.index,
            0,
            nodePosition.node
          );
        } else if (data.treeInstruction.type === 'reorder-below') {
          if (dropAtPosition.node.id === 'root') {
            return;
          }
          dropAtPosition.parent.children.splice(
            dropAtPosition.index + 1,
            0,
            nodePosition.node
          );
        } else if (data.treeInstruction.type === 'instruction-blocked') {
          return;
        }
        setTree(clonedTree);
      }
    },
    [tree]
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <ReorderableTreeNode
        isLastInGroup={true}
        level={0}
        node={tree}
        onDrop={handleDrop}
      />
    </div>
  );
};
ReorderableList.argTypes = {
  orientation: {
    type: {
      name: 'enum',
      value: ['horizontal', 'vertical'],
      required: true,
    },
  },
};
ReorderableList.args = {
  orientation: 'vertical',
};
