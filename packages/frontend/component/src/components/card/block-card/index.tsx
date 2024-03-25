import type { HTMLAttributes, ReactNode } from 'react';
import { forwardRef } from 'react';

import * as styles from './styles.css';

export const BlockCard = forwardRef<
  HTMLDivElement,
  {
    left?: ReactNode;
    title: string;
    desc?: string;
    right?: ReactNode;
    disabled?: boolean;
  } & HTMLAttributes<HTMLDivElement>
>(({ left, title, desc, right, disabled, onClick, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={styles.blockCard}
      role="button"
      aria-disabled={disabled}
      onClick={disabled ? undefined : onClick}
      {...props}
    >
      {left && <div className={styles.blockCardAround}>{left}</div>}
      <div className={styles.blockCardContent}>
        <div>{title}</div>
        <div className={styles.blockCardDesc}>{desc}</div>
      </div>
      {right && <div className={styles.blockCardAround}>{right}</div>}
    </div>
  );
});
BlockCard.displayName = 'BlockCard';
