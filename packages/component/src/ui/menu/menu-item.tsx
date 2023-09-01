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
  iconSize?: number;
  disabled?: boolean;
  active?: boolean;
  disableHover?: boolean;
  userFocused?: boolean;
  gap?: string;
  fontSize?: string;
}> &
  HTMLAttributes<HTMLButtonElement>;

export const MenuItem = forwardRef<HTMLButtonElement, IconMenuProps>(
  ({ endIcon, icon, children, gap, fontSize, iconSize, ...props }, ref) => {
    return (
      <StyledMenuItem ref={ref} {...props}>
        {icon && (
          <StyledStartIconWrapper iconSize={iconSize} gap={gap}>
            {icon}
          </StyledStartIconWrapper>
        )}
        <StyledContent fontSize={fontSize}>{children}</StyledContent>
        {endIcon && (
          <StyledEndIconWrapper iconSize={iconSize} gap={gap}>
            {endIcon}
          </StyledEndIconWrapper>
        )}
      </StyledMenuItem>
    );
  }
);
MenuItem.displayName = 'MenuItem';
export default MenuItem;
