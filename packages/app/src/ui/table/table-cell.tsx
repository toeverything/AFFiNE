import { HTMLAttributes, PropsWithChildren } from 'react';
import { TableCellProps } from './interface';
import { StyledTableCell } from './styles';

export const TableCell = ({
  children,
  ellipsis,
  ...props
}: PropsWithChildren<
  TableCellProps & HTMLAttributes<HTMLTableCellElement>
>) => {
  return <StyledTableCell {...props}>{children}</StyledTableCell>;
};

export default TableCell;
