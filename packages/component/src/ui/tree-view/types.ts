import type { CSSProperties, ReactNode } from 'react';

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
    },
    extendProps?: RenderProps
  ) => ReactNode;
};

type CommonProps<RenderProps = unknown> = {
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
};

export type TreeNodeProps<RenderProps = unknown> = {
  node: Node<RenderProps>;
  index: number;
  allowDrop?: boolean;
} & CommonProps<RenderProps>;

export type TreeNodeItemProps<RenderProps = unknown> = {
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
} & TreeNodeProps<RenderProps>;

export type TreeViewProps<RenderProps = unknown> = {
  data: Node<RenderProps>[];
} & CommonProps<RenderProps>;

export type NodeLIneProps<RenderProps = unknown> = {
  allowDrop: boolean;
  isTop?: boolean;
} & Pick<TreeNodeProps<RenderProps>, 'node' | 'onDrop'>;
