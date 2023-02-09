import { CSSProperties } from 'react';

export type TableCellProps = {
  align?: 'left' | 'right' | 'center';
  ellipsis?: boolean;
  proportion?: number;
  style?: CSSProperties;
};
