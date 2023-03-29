import type { CSSProperties, ReactNode } from 'react';

export type Node<N, ExtendRenderProps> = {
  id: string;
  children?: Node<N, ExtendRenderProps>[];
  render?: (
    node: Node<N, ExtendRenderProps>,
    eventsAndStatus: {
      isOver: boolean;
      onAdd: () => void;
      onDelete: () => void;
      collapsed: boolean;
      setCollapsed: (collapsed: boolean) => void;
    },
    extendProps: ExtendRenderProps
  ) => ReactNode;
} & N;

type CommonProps<N, ExtendRenderProps> = {
  indent?: CSSProperties['paddingLeft'];
  onAdd?: (node: Node<N, ExtendRenderProps>) => void;
  onDelete?: (node: Node<N, ExtendRenderProps>) => void;
  onDrop?: (
    dragNode: Node<N, ExtendRenderProps>,
    dropNode: Node<N, ExtendRenderProps>,
    position: {
      topLine: boolean;
      bottomLine: boolean;
      internal: boolean;
    }
  ) => void;
};

export type TreeNodeProps<N, ExtendRenderProps> = {
  node: Node<N, ExtendRenderProps>;
  index: number;
  allowDrop?: boolean;
} & CommonProps<N, ExtendRenderProps>;

export type TreeNodeItemProps<N, ExtendRenderProps> = {
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
} & TreeNodeProps<N, ExtendRenderProps>;

export type TreeViewProps<N, ExtendRenderProps> = {
  data: Node<N, ExtendRenderProps>[];
} & CommonProps<N, ExtendRenderProps>;

export type NodeLIneProps<N, ExtendRenderProps> = {
  allowDrop: boolean;
  isTop?: boolean;
} & Pick<TreeNodeProps<N, ExtendRenderProps>, 'node' | 'onDrop'>;
