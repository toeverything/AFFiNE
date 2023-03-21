import type { TableCellProps } from './interface';
import { StyledTableCell } from './styles';
export const TableCell = ({ children, ...props }: TableCellProps) => {
  return <StyledTableCell {...props}>{children}</StyledTableCell>;
};

export default TableCell;
