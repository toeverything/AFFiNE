import { CSSProperties, HTMLAttributes, PropsWithChildren } from 'react';

export type TableCellProps = {
  align?: 'left' | 'right' | 'center';
  ellipsis?: boolean;
  proportion?: number;
  style?: CSSProperties;
} & PropsWithChildren &
  HTMLAttributes<HTMLTableCellElement>;
