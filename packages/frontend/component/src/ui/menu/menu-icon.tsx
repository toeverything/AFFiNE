import clsx from 'clsx';
import type { PropsWithChildren, ReactNode } from 'react';
import { forwardRef, type HTMLAttributes, useMemo } from 'react';

import { menuItemIcon } from './styles.css';

export interface MenuIconProps
  extends PropsWithChildren,
    HTMLAttributes<HTMLDivElement> {
  icon?: ReactNode;
  position?: 'start' | 'end';
}

export const MenuIcon = forwardRef<HTMLDivElement, MenuIconProps>(
  ({ children, icon, position = 'start', className, ...otherProps }, ref) => {
    return (
      <div
        ref={ref}
        className={useMemo(
          () =>
            clsx(
              menuItemIcon,
              {
                end: position === 'end',
                start: position === 'start',
              },
              className
            ),
          [className, position]
        )}
        {...otherProps}
      >
        {icon || children}
      </div>
    );
  }
);

MenuIcon.displayName = 'MenuIcon';
