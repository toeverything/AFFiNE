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
}> &
  HTMLAttributes<HTMLButtonElement>;

export const MenuItem = forwardRef<HTMLButtonElement, IconMenuProps>(
  ({ isDir = false, icon, children, ...props }, ref) => {
    return (
      <StyledMenuItem ref={ref} {...props}>
        {icon &&
          cloneElement(icon, {
            width: 16,
            height: 16,
            style: {
              marginRight: 14,
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
