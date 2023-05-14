import type { CSSProperties, HTMLAttributes, PropsWithChildren } from 'react';

export type TableCellProps = {
  align?: 'left' | 'right' | 'center';
  ellipsis?: boolean;
  proportion?: number;
  active?: boolean;
  style?: CSSProperties;
} & PropsWithChildren &
  HTMLAttributes<HTMLTableCellElement>;
