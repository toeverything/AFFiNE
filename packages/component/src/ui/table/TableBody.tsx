import { HTMLAttributes, PropsWithChildren } from 'react';

import { StyledTableBody } from './styles';

export const TableBody = ({
  children,
  ...props
}: PropsWithChildren<HTMLAttributes<HTMLTableSectionElement>>) => {
  return <StyledTableBody {...props}>{children}</StyledTableBody>;
};

export default TableBody;
