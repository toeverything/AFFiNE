import React from 'react';

import type { TableCellProps } from './interface';
import { StyledTableCell } from './styles';

export const TableCell = React.forwardRef<HTMLTableCellElement, TableCellProps>(
  ({ children, ...props }, ref) => {
    return (
      <StyledTableCell ref={ref} {...props}>
        {children}
      </StyledTableCell>
    );
  }
);
TableCell.displayName = 'TableCell';

export default TableCell;
