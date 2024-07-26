import clsx from 'clsx';
import { type ForwardedRef, forwardRef, type PropsWithChildren } from 'react';

import * as styles from './index.css';

export type CategoryDividerProps = PropsWithChildren<
  {
    label: string;
    className?: string;
  } & {
    [key: `data-${string}`]: unknown;
  }
>;

export const CategoryDivider = forwardRef(
  (
    { label, children, className, ...otherProps }: CategoryDividerProps,
    ref: ForwardedRef<HTMLDivElement>
  ) => {
    return (
      <div className={clsx([styles.root, className])} ref={ref} {...otherProps}>
        <div className={styles.label}>{label}</div>
        {children}
      </div>
    );
  }
);

CategoryDivider.displayName = 'CategoryDivider';
