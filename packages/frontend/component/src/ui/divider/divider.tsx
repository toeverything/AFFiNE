import { assignInlineVars } from '@vanilla-extract/dynamic';
import clsx from 'clsx';
import type { HTMLAttributes, PropsWithChildren } from 'react';
import { forwardRef } from 'react';

import * as styles from './style.css';
export type DividerOrientation = 'horizontal' | 'vertical';
export type DividerProps = PropsWithChildren &
  Omit<HTMLAttributes<HTMLDivElement>, 'type'> & {
    orientation?: DividerOrientation;
    size?: 'thinner' | 'default';
    space?: number;
    dividerColor?: string;
  };

export const Divider = forwardRef<HTMLDivElement, DividerProps>(
  (
    {
      orientation = 'horizontal',
      size = 'default',
      space: propSpace,
      dividerColor,
      style,
      className,
      ...otherProps
    },
    ref
  ) => {
    const space = propSpace ?? (orientation === 'horizontal' ? 8 : 2);

    return (
      <div
        data-divider
        ref={ref}
        className={clsx(
          styles.divider,
          {
            [styles.verticalDivider]: orientation === 'vertical',
            [styles.thinner]: size === 'thinner',
          },
          className
        )}
        style={{
          borderColor: dividerColor ? dividerColor : undefined,
          ...style,
          ...assignInlineVars({ [styles.dividerSpace]: `${space}px` }),
        }}
        {...otherProps}
      />
    );
  }
);

Divider.displayName = 'Divider';
export default Divider;
