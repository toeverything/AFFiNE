import { IconButton } from '@affine/component';
import { ToggleCollapseIcon } from '@blocksuite/icons/rc';
import clsx from 'clsx';
import { type ForwardedRef, forwardRef, type PropsWithChildren } from 'react';

import * as styles from './index.css';

export type CategoryDividerProps = PropsWithChildren<
  {
    label: string;
    className?: string;
    collapsed?: boolean;
    setCollapsed?: (collapsed: boolean) => void;
  } & {
    [key: `data-${string}`]: unknown;
  }
>;

export const CategoryDivider = forwardRef(
  (
    {
      label,
      children,
      className,
      collapsed,
      setCollapsed,
      ...otherProps
    }: CategoryDividerProps,
    ref: ForwardedRef<HTMLDivElement>
  ) => {
    const collapsible = collapsed !== undefined;

    return (
      <div
        className={clsx([styles.root, className])}
        ref={ref}
        onClick={() => setCollapsed?.(!collapsed)}
        data-collapsed={collapsed}
        data-collapsible={collapsible}
        {...otherProps}
      >
        <div className={styles.label}>
          {label}
          {collapsible ? (
            <IconButton
              withoutHoverStyle
              className={styles.collapseButton}
              size="small"
              data-testid="category-divider-collapse-button"
            >
              <ToggleCollapseIcon className={styles.collapseIcon} />
            </IconButton>
          ) : null}
        </div>
        <div className={styles.actions} onClick={e => e.stopPropagation()}>
          {children}
        </div>
      </div>
    );
  }
);

CategoryDivider.displayName = 'CategoryDivider';
