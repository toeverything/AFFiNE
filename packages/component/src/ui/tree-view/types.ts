import type { ReactNode } from 'react';

export type Node<N> = {
  id: string;
  children?: Node<N>[];
  render?: (
    node: Node<N>,
    eventsAndStatus: {
      onAdd: () => void;
      onDelete: () => void;
      collapsed: boolean;
      setCollapsed: (collapsed: boolean) => void;
    },
    extendProps?: unknown
  ) => ReactNode;
} & N;

type CommonProps<N> = {
  onAdd?: (node: Node<N>) => void;
  onDelete?: (node: Node<N>) => void;
  onDrop?: (dragNode: Node<N>, dropNode: Node<N>, dropUnder: boolean) => void;
};

export type TreeNodeProps<N> = {
  node: Node<N>;
} & CommonProps<N>;

export type TreeViewProps<N> = {
  data: Node<N>[];
} & CommonProps<N>;

export type NodeLIneProps<N> = {
  allowDrop: boolean;
} & Pick<TreeNodeProps<N>, 'node' | 'onDrop'>;
