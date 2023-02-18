import { HTMLAttributes, PropsWithChildren } from 'react';
import React from 'react';

import { StyledTableHead } from './styles';

export const TableHead = ({
  children,
  ...props
}: PropsWithChildren<HTMLAttributes<HTMLTableSectionElement>>) => {
  return <StyledTableHead {...props}>{children}</StyledTableHead>;
};

export default TableHead;
