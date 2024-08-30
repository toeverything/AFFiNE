import clsx from 'clsx';
import type { HTMLAttributes, PropsWithChildren } from 'react';
import { forwardRef } from 'react';

import * as styles from './style.css';
export type DividerOrientation = 'horizontal' | 'vertical';
export type DividerProps = PropsWithChildren &
  Omit<HTMLAttributes<HTMLDivElement>, 'type'> & {
    orientation?: DividerOrientation;
    size?: 'thinner' | 'default';
    dividerColor?: string;
  };

export const Divider = forwardRef<HTMLDivElement, DividerProps>(
  (
    {
      orientation = 'horizontal',
      size = 'default',
      dividerColor = 'var(--affine-border-color)',
      style,
      className,
      ...otherProps
    },
    ref
  ) => {
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
          backgroundColor: dividerColor ? dividerColor : undefined,
          ...style,
        }}
        {...otherProps}
      />
    );
  }
);

Divider.displayName = 'Divider';
export default Divider;
