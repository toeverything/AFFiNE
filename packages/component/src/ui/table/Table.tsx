import { Children, HTMLAttributes, PropsWithChildren, ReactNode } from 'react';
import React from 'react';

import { StyledTable } from './styles';
const childrenHasEllipsis = (children: ReactNode | ReactNode[]): boolean => {
  return Children.toArray(children).some(child => {
    if (typeof child === 'object' && 'props' in child) {
      if (!child.props.ellipsis && child.props.children) {
        return childrenHasEllipsis(child.props.children);
      }
      return child.props.ellipsis ?? false;
    }

    return false;
  });
};

export const Table = ({
  children,
  ...props
}: PropsWithChildren<HTMLAttributes<HTMLTableElement>>) => {
  const tableLayout = childrenHasEllipsis(children) ? 'fixed' : 'auto';

  return (
    <StyledTable tableLayout={tableLayout} {...props}>
      {children}
    </StyledTable>
  );
};

export default Table;
