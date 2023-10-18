import clsx from 'clsx';
import type { PropsWithChildren } from 'react';

import * as styles from './index.css';

interface CategoryDividerProps extends PropsWithChildren {
  label: string;
}

export function CategoryDivider({ label, children }: CategoryDividerProps) {
  return (
    <div className={clsx([styles.root])}>
      <div className={styles.label}>{label}</div>
      {children}
    </div>
  );
}
