import type { HTMLAttributes, PropsWithChildren, ReactElement } from 'react';
import { cloneElement, forwardRef } from 'react';

import { StyledArrow, StyledMenuItem } from './styles';
export type IconMenuProps = PropsWithChildren<{
  isDir?: boolean;
  icon?: ReactElement;
  iconSize?: [number, number];
  disabled?: boolean;
}> &
  HTMLAttributes<HTMLButtonElement>;

export const MenuItem = forwardRef<HTMLButtonElement, IconMenuProps>(
  ({ isDir = false, icon, iconSize, children, ...props }, ref) => {
    const [iconWidth, iconHeight] = iconSize || [20, 20];
    return (
      <StyledMenuItem ref={ref} {...props}>
        {icon &&
          cloneElement(icon, {
            width: iconWidth,
            height: iconHeight,
            style: {
              marginRight: 12,
              ...icon.props?.style,
            },
          })}
        {children}
        {isDir ? <StyledArrow /> : null}
      </StyledMenuItem>
    );
  }
);
MenuItem.displayName = 'MenuItem';
export default MenuItem;
