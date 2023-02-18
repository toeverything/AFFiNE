import { HTMLAttributes, PropsWithChildren } from 'react';
import React from 'react';

import { StyledTableRow } from './styles';
export const TableRow = ({
  children,
  ...props
}: PropsWithChildren<HTMLAttributes<HTMLTableRowElement>>) => {
  return <StyledTableRow {...props}>{children}</StyledTableRow>;
};

export default TableRow;
