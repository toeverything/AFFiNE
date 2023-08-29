import { ArrowDownSmallIcon } from '@blocksuite/icons';
import clsx from 'clsx';
import React from 'react';
import type { LinkProps } from 'react-router-dom';
import { Link } from 'react-router-dom';

import * as styles from './index.css';

export interface MenuItemProps extends React.HTMLAttributes<HTMLButtonElement> {
  icon?: React.ReactElement;
  active?: boolean;
  disabled?: boolean;
  // true, false, undefined. undefined means no collapse
  collapsed?: boolean;
  // if onCollapsedChange is given, but collapsed is undefined, then we will render the collapse button as disabled
  onCollapsedChange?: (collapsed: boolean) => void;
  postfix?: React.ReactElement;
}

export interface MenuLinkItemProps
  extends MenuItemProps,
    Pick<LinkProps, 'to'> {}

const stopPropagation: React.MouseEventHandler = e => {
  e.stopPropagation();
};

export const MenuItem = React.forwardRef<HTMLButtonElement, MenuItemProps>(
  (
    {
      onClick,
      icon,
      active,
      children,
      disabled,
      collapsed,
      onCollapsedChange,
      postfix,
      ...props
    },
    ref
  ) => {
    const collapsible = onCollapsedChange !== undefined;
    return (
      <button
        ref={ref}
        {...props}
        onClick={onClick}
        className={clsx([styles.root, props.className])}
        data-active={active}
        data-disabled={disabled}
        data-collapsible={collapsible}
      >
        {icon && (
          <div className={styles.iconsContainer} data-collapsible={collapsible}>
            {collapsible && (
              <div
                data-disabled={collapsed === undefined ? true : undefined}
                onClick={e => {
                  e.stopPropagation();
                  e.preventDefault(); // for links
                  onCollapsedChange?.(!collapsed);
                }}
                data-testid="fav-collapsed-button"
                className={styles.collapsedIconContainer}
              >
                <ArrowDownSmallIcon
                  className={styles.collapsedIcon}
                  data-collapsed={collapsed !== false}
                />
              </div>
            )}
            {React.cloneElement(icon, {
              className: clsx([styles.icon, icon.props.className]),
            })}
          </div>
        )}

        <div className={styles.content}>{children}</div>
        {postfix ? (
          <div className={styles.postfix} onClick={stopPropagation}>
            {postfix}
          </div>
        ) : null}
      </button>
    );
  }
);
MenuItem.displayName = 'MenuItem';

export const MenuLinkItem = React.forwardRef<
  HTMLButtonElement,
  MenuLinkItemProps
>(({ to, ...props }, ref) => {
  return (
    <Link to={to} className={styles.linkItemRoot}>
      {/* The <a> element rendered by Link does not generate display box due to `display: contents` style */}
      {/* Thus ref is passed to MenuItem instead of Link */}
      <MenuItem ref={ref} {...props}></MenuItem>
    </Link>
  );
});
MenuLinkItem.displayName = 'MenuLinkItem';
