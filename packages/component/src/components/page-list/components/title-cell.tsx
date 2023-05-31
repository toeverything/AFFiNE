import type { TableCellProps } from '@affine/component';
import { Content, TableCell } from '@affine/component';
import React, { useCallback } from 'react';

import {
  StyledTitleContentWrapper,
  StyledTitleLink,
  StyledTitlePreview,
} from '../styles';

type TitleCellProps = {
  icon: JSX.Element;
  text: string;
  desc?: string;
  suffix?: JSX.Element;
  /**
   * Customize the children of the cell
   * @param element
   * @returns
   */
  children?: (element: React.ReactElement) => React.ReactNode;
} & Omit<TableCellProps, 'children'>;

export const TitleCell = React.forwardRef<HTMLTableCellElement, TitleCellProps>(
  ({ icon, text, desc, suffix, children: render, ...props }, ref) => {
    const renderChildren = useCallback(() => {
      const childElement = (
        <>
          <StyledTitleLink>
            {icon}
            <StyledTitleContentWrapper>
              <Content ellipsis={true} maxWidth="100%" color="inherit">
                {text}
              </Content>
              {desc && (
                <StyledTitlePreview ellipsis={true} color="inherit">
                  {desc}
                </StyledTitlePreview>
              )}
            </StyledTitleContentWrapper>
          </StyledTitleLink>
          {suffix}
        </>
      );

      return render ? render(childElement) : childElement;
    }, [desc, icon, render, suffix, text]);

    return (
      <TableCell ref={ref} {...props}>
        {renderChildren()}
      </TableCell>
    );
  }
);
TitleCell.displayName = 'TitleCell';
