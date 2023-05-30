import type { TableCellProps } from '@affine/component';
import { Content, TableCell } from '@affine/component';
import React, { useCallback } from 'react';

import { StyledTitleLink } from '../styles';

type TitleCellProps = {
  icon: JSX.Element;
  text: string;
  suffix?: JSX.Element;
  /**
   * Customize the children of the cell
   * @param element
   * @returns
   */
  children?: (element: React.ReactElement) => React.ReactNode;
} & Omit<TableCellProps, 'children'>;

export const TitleCell = React.forwardRef<HTMLTableCellElement, TitleCellProps>(
  ({ icon, text, suffix, children: render, ...props }, ref) => {
    const renderChildren = useCallback(() => {
      const childElement = (
        <>
          <StyledTitleLink>
            {icon}
            <Content ellipsis={true} color="inherit">
              {text}
            </Content>
          </StyledTitleLink>
          {suffix}
        </>
      );

      return render ? render(childElement) : childElement;
    }, [icon, render, suffix, text]);

    return (
      <TableCell ref={ref} {...props}>
        {renderChildren()}
      </TableCell>
    );
  }
);
TitleCell.displayName = 'TitleCell';
