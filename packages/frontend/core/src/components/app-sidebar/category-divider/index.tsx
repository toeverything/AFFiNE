import { IconButton } from '@affine/component';
import { ToggleCollapseIcon, ToggleExpandIcon } from '@blocksuite/icons/rc';
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
    return (
      <div className={clsx([styles.root, className])} ref={ref} {...otherProps}>
        <div
          className={styles.label}
          onClick={() => setCollapsed?.(!collapsed)}
        >
          {label}
          {collapsed !== undefined && (
            <IconButton
              withoutHoverStyle
              className={styles.collapseButton}
              size="small"
              data-testid="category-divider-collapse-button"
            >
              {collapsed ? <ToggleCollapseIcon /> : <ToggleExpandIcon />}
            </IconButton>
          )}
        </div>
        <div style={{ flex: 1 }}></div>
        {children}
      </div>
    );
  }
);

CategoryDivider.displayName = 'CategoryDivider';
