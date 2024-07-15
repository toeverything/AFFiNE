import clsx from 'clsx';
import { type ForwardedRef, forwardRef, type PropsWithChildren } from 'react';

import * as styles from './index.css';

export interface CategoryDividerProps extends PropsWithChildren {
  label: string;
  className?: string;
}

export const CategoryDivider = forwardRef(
  (
    { label, children, className }: CategoryDividerProps,
    ref: ForwardedRef<HTMLDivElement>
  ) => {
    return (
      <div className={clsx([styles.root, className])} ref={ref}>
        <div className={styles.label}>{label}</div>
        {children}
      </div>
    );
  }
);

CategoryDivider.displayName = 'CategoryDivider';
