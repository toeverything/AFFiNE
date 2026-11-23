export type MasonryItem = React.HTMLAttributes<HTMLDivElement> & {
  id: string;
  Component?: React.ComponentType<{ groupId: string; itemId: string }>;
} & ({ height: number } | { ratio: number });

export interface MasonryGroup extends React.HTMLAttributes<HTMLDivElement> {
  id: string;
  height: number;
  items: MasonryItem[];
  Component?: React.ComponentType<{
    groupId: string;
    collapsed?: boolean;
    itemCount: number;
  }>;
}

export interface MasonryItemXYWH {
  type: 'item' | 'group';
  x: number;
  y: number;
  w: number;
  h: number;
}

export type MasonryPX = number | ((totalWidth: number) => number);
