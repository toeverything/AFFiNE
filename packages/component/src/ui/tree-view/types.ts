import type { CSSProperties, ReactNode, Ref } from 'react';

export type Node<RenderProps = unknown> = {
  id: string;
  children?: Node<RenderProps>[];
  render: (
    node: Node<RenderProps>,
    eventsAndStatus: {
      isOver: boolean;
      onAdd: () => void;
      onDelete: () => void;
      collapsed: boolean;
      setCollapsed: (collapsed: boolean) => void;
      isSelected: boolean;
    },
    extendProps?: RenderProps
  ) => ReactNode;
};

type CommonProps<RenderProps = unknown> = {
  enableDnd?: boolean;
  enableKeyboardSelection?: boolean;
  indent?: CSSProperties['paddingLeft'];
  onAdd?: (node: Node<RenderProps>) => void;
  onDelete?: (node: Node<RenderProps>) => void;
  onDrop?: (
    dragNode: Node<RenderProps>,
    dropNode: Node<RenderProps>,
    position: {
      topLine: boolean;
      bottomLine: boolean;
      internal: boolean;
    }
  ) => void;
  // Only trigger when the enableKeyboardSelection is true
  onSelect?: (id: string) => void;
};

export type TreeNodeProps<RenderProps = unknown> = {
  node: Node<RenderProps>;
  index: number;
  allowDrop?: boolean;
  selectedId?: string;
  isDragging?: boolean;
  dragRef?: Ref<HTMLDivElement>;
} & CommonProps<RenderProps>;

export type TreeNodeItemProps<RenderProps = unknown> = {
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;

  isOver?: boolean;
  canDrop?: boolean;

  dropRef?: Ref<HTMLDivElement>;
} & TreeNodeProps<RenderProps>;

export type TreeViewProps<RenderProps = unknown> = {
  data: Node<RenderProps>[];
} & CommonProps<RenderProps>;

export type NodeLIneProps<RenderProps = unknown> = {
  allowDrop: boolean;
  isTop?: boolean;
} & Pick<TreeNodeProps<RenderProps>, 'node' | 'onDrop'>;
