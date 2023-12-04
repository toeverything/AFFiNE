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

const defaultProps = {
  orientation: 'horizontal',
  size: 'default',
};

export const Divider = forwardRef<HTMLDivElement, DividerProps>(
  (props, ref) => {
    const { orientation, className, size, dividerColor, style, ...otherProps } =
      {
        ...defaultProps,
        ...props,
      };

    return (
      <div
        ref={ref}
        className={clsx(
          styles.divider,
          {
            [styles.verticalDivider]: orientation === 'vertical',
            [styles.thinner]:
              size === 'thinner' && orientation === 'horizontal',
            [styles.verticalThinner]:
              size === 'thinner' && orientation === 'vertical',
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
