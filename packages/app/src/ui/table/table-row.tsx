import { PropsWithChildren } from 'react';
import { StyledTableRow } from './styles';

export const TableRow = ({ children }: PropsWithChildren<{}>) => {
  return <StyledTableRow>{children}</StyledTableRow>;
};

export default TableRow;
