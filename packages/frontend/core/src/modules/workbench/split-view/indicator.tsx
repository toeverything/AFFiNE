import clsx from 'clsx';
import { forwardRef, type HTMLAttributes, memo } from 'react';

import * as styles from './indicator.css';

export interface SplitViewMenuProps extends HTMLAttributes<HTMLDivElement> {
  active?: boolean;
}

export const SplitViewMenuIndicator = memo(
  forwardRef<HTMLDivElement, SplitViewMenuProps>(
    function SplitViewMenuIndicator(
      { className, active, ...attrs }: SplitViewMenuProps,
      ref
    ) {
      return (
        <div
          ref={ref}
          data-active={active}
          className={clsx(className, styles.indicator)}
          {...attrs}
        >
          <div className={styles.indicatorInner} />
        </div>
      );
    }
  )
);
