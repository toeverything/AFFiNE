import type { HTMLAttributes, PropsWithChildren, ReactElement } from 'react';
import { forwardRef } from 'react';

import {
  StyledContent,
  StyledEndIconWrapper,
  StyledMenuItem,
  StyledStartIconWrapper,
} from './styles';

export type IconMenuProps = PropsWithChildren<{
  icon?: ReactElement;
  endIcon?: ReactElement;
  iconSize?: [number, number];
  disabled?: boolean;
  active?: boolean;
  disableHover?: boolean;
}> &
  HTMLAttributes<HTMLButtonElement>;

export const MenuItem = forwardRef<HTMLButtonElement, IconMenuProps>(
  ({ endIcon, icon, children, ...props }, ref) => {
    return (
      <StyledMenuItem ref={ref} {...props}>
        {icon && <StyledStartIconWrapper>{icon}</StyledStartIconWrapper>}
        <StyledContent>{children}</StyledContent>
        {endIcon && <StyledEndIconWrapper>{endIcon}</StyledEndIconWrapper>}
      </StyledMenuItem>
    );
  }
);
MenuItem.displayName = 'MenuItem';
export default MenuItem;
