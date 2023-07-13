import React, { useCallback } from 'react';

import type { TableCellProps } from '../../..';
import { Content, TableCell } from '../../..';
import {
  StyledTitleContentWrapper,
  StyledTitleLink,
  StyledTitlePreview,
} from '../styles';
import type { PageListProps } from '../type';

type TitleCellProps = {
  pageId: string;
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
  usePreview: PageListProps['usePreview'];
} & Omit<TableCellProps, 'children'>;

export const TitleCell = React.forwardRef<HTMLTableCellElement, TitleCellProps>(
  (
    {
      pageId,
      icon,
      text,
      desc,
      suffix,
      children: render,
      usePreview,
      ...props
    },
    ref
  ) => {
    const preview = usePreview(pageId);
    const renderChildren = useCallback(() => {
      const childElement = (
        <>
          <StyledTitleLink>
            {icon}
            <StyledTitleContentWrapper>
              <Content
                ellipsis={true}
                maxWidth="100%"
                color="inherit"
                fontSize="var(--affine-font-sm)"
                weight="600"
                lineHeight="18px"
              >
                {text}
              </Content>
              {preview && (
                <StyledTitlePreview
                  ellipsis={true}
                  color="var(--affine-text-secondary-color)"
                >
                  {preview}
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
