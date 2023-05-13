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

export function MenuItem({
  onClick,
  icon,
  active,
  children,
  disabled,
  ...props
}: MenuItemProps) {
  return (
    <div
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

export function MenuLinkItem({ href, ...props }: MenuLinkItemProps) {
  return (
    <Link href={href} className={styles.linkItemRoot}>
      <MenuItem {...props}></MenuItem>
    </Link>
  );
}
