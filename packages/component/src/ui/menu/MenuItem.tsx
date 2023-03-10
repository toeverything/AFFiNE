import {
  cloneElement,
  forwardRef,
  HTMLAttributes,
  PropsWithChildren,
  ReactElement,
} from 'react';

import { StyledArrow, StyledMenuItem } from './styles';
export type IconMenuProps = PropsWithChildren<{
  isDir?: boolean;
  icon?: ReactElement;
  iconSize?: [number, number];
}> &
  HTMLAttributes<HTMLButtonElement>;

export const MenuItem = forwardRef<HTMLButtonElement, IconMenuProps>(
  ({ isDir = false, icon, iconSize, children, ...props }, ref) => {
    const [iconWidth, iconHeight] = iconSize || [16, 16];
    return (
      <StyledMenuItem ref={ref} {...props}>
        {icon &&
          cloneElement(icon, {
            width: iconWidth,
            height: iconHeight,
            style: {
              marginRight: 14,
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
