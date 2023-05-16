import clsx from 'clsx';
import type { LinkProps } from 'next/link';
import Link from 'next/link';
import React from 'react';

import * as styles from './index.css';

interface MenuItemProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ReactElement;
  active?: boolean;
  disabled?: boolean;
}

interface MenuLinkItemProps extends MenuItemProps, Pick<LinkProps, 'href'> {}

export const MenuItem = React.forwardRef<HTMLDivElement, MenuItemProps>(
  ({ onClick, icon, active, children, disabled, ...props }, ref) => {
    return (
      <div
        ref={ref}
        {...props}
        className={clsx([styles.root, props.className])}
        onClick={onClick}
        data-active={active}
        data-disabled={disabled}
      >
        {icon &&
          React.cloneElement(icon, {
            className: clsx([styles.icon, icon.props.className]),
          })}
        <div className={styles.content}>{children}</div>
      </div>
    );
  }
);
MenuItem.displayName = 'MenuItem';

export const MenuLinkItem = React.forwardRef<HTMLDivElement, MenuLinkItemProps>(
  ({ href, ...props }, ref) => {
    return (
      <Link href={href} className={styles.linkItemRoot}>
        {/* The <a> element rendered by Link does not generate display box due to `display: contents` style */}
        {/* Thus ref is passed to MenuItem instead of Link */}
        <MenuItem ref={ref} {...props}></MenuItem>
      </Link>
    );
  }
);
MenuLinkItem.displayName = 'MenuLinkItem';
