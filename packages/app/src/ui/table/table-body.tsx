import { PropsWithChildren } from 'react';
import { StyledTableBody } from '@/ui/table/styles';

export const TableBody = ({ children }: PropsWithChildren<{}>) => {
  return <StyledTableBody>{children}</StyledTableBody>;
};

export default TableBody;
