import { ArrowDownSmallIcon } from '@blocksuite/icons';
import clsx from 'clsx';
import type { LinkProps } from 'next/link';
import Link from 'next/link';
import React from 'react';

import * as styles from './index.css';

interface MenuItemProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ReactElement;
  active?: boolean;
  disabled?: boolean;
  collapsed?: boolean; // true, false, undefined. undefined means no collapse
  onCollapsedChange?: (collapsed: boolean) => void;
}

interface MenuLinkItemProps extends MenuItemProps, Pick<LinkProps, 'href'> {}

export function MenuItem({
  onClick,
  icon,
  active,
  children,
  disabled,
  collapsed,
  onCollapsedChange,
  ...props
}: MenuItemProps) {
  const collapsible = collapsed !== undefined;
  if (collapsible && !onCollapsedChange) {
    throw new Error('onCollapsedChange is required when collapsed is defined');
  }
  return (
    <div
      {...props}
      className={clsx([styles.root, props.className])}
      onClick={onClick}
      data-active={active}
      data-disabled={disabled}
      data-collapsible={collapsible}
    >
      <div className={styles.iconsContainer} data-collapsible={collapsible}>
        {collapsible && (
          <div
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
              data-collapsed={collapsed}
            />
          </div>
        )}
        {icon &&
          React.cloneElement(icon, {
            className: clsx([styles.icon, icon.props.className]),
          })}
      </div>

      <div className={styles.content}>{children}</div>
    </div>
  );
}

export function MenuLinkItem({ href, ...props }: MenuLinkItemProps) {
  return (
    <Link href={href} className={styles.linkItemRoot}>
      <MenuItem {...props}></MenuItem>
    </Link>
  );
}
