import type { TableCellProps } from '@affine/component';
import { Content, TableCell } from '@affine/component';
import React from 'react';

import { StyledTitleLink } from '../styles';

export const TitleCell = React.forwardRef<
  HTMLTableCellElement,
  {
    icon: JSX.Element;
    text: string;
    suffix?: JSX.Element;
  } & TableCellProps
>(({ icon, text, suffix, ...props }, ref) => {
  return (
    <TableCell ref={ref} {...props}>
      <StyledTitleLink>
        {icon}
        <Content ellipsis={true} color="inherit">
          {text}
        </Content>
      </StyledTitleLink>
      {suffix}
    </TableCell>
  );
});
TitleCell.displayName = 'TitleCell';
