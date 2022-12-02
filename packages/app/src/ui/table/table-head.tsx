import { PropsWithChildren } from 'react';
import { StyledTableHead } from './styles';

export const TableHead = ({ children }: PropsWithChildren<{}>) => {
  return <StyledTableHead>{children}</StyledTableHead>;
};

export default TableHead;
