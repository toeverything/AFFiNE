export interface MasonryItem {
  id: string;
}

export interface MasonryGroup {
  id: string;
  items: MasonryItem[];
}

export interface MasonryItemXYWH {
  type: 'item' | 'group';
  x: number;
  y: number;
  w: number;
  h: number;
}

export type MasonryPX = number | ((totalWidth: number) => number);
