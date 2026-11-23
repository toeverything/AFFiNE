import { WorkbenchLink } from '@affine/core/modules/workbench';
import { ArrowDownSmallIcon } from '@blocksuite/icons/rc';
import clsx from 'clsx';
import React, { type SVGAttributes } from 'react';
import type { To } from 'react-router-dom';

import * as styles from './index.css';

export interface MenuItemProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ReactElement<SVGAttributes<SVGElement>>;
  active?: boolean;
  disabled?: boolean;
  // true, false, undefined. undefined means no collapse
  collapsed?: boolean;
  // if onCollapsedChange is given, but collapsed is undefined, then we will render the collapse button as disabled
  onCollapsedChange?: (collapsed: boolean) => void;
  postfix?: React.ReactElement;
  postfixDisplay?: 'always' | 'hover';
}

export interface MenuLinkItemProps extends MenuItemProps {
  to: To;
  linkComponent?: React.ComponentType<{ to: To; className?: string }>;
}

const stopPropagation: React.MouseEventHandler = e => {
  e.stopPropagation();
};

/**
 * This component is not a generic component.
 * It is used for the app sidebar.
 */
export const MenuItem = React.forwardRef<HTMLDivElement, MenuItemProps>(
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
      postfixDisplay = 'hover',
      ...props
    },
    ref
  ) => {
    const collapsible = onCollapsedChange !== undefined;
    return (
      <div
        ref={ref}
        {...props}
        onClick={onClick}
        className={clsx([styles.root, props.className])}
        data-active={active}
        data-disabled={disabled}
        data-collapsible={collapsible}
        tabIndex={0}
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
          <div
            className={styles.postfix}
            data-postfix-display={postfixDisplay}
            onClick={stopPropagation}
          >
            {postfix}
          </div>
        ) : null}
      </div>
    );
  }
);
MenuItem.displayName = 'MenuItem';

export const MenuLinkItem = React.forwardRef<HTMLDivElement, MenuLinkItemProps>(
  ({ to, linkComponent: LinkComponent = WorkbenchLink, ...props }, ref) => {
    return (
      <LinkComponent to={to} className={styles.linkItemRoot}>
        {/* The <a> element rendered by Link does not generate display box due to `display: contents` style */}
        {/* Thus ref is passed to MenuItem instead of Link */}
        <MenuItem ref={ref} {...props}></MenuItem>
      </LinkComponent>
    );
  }
);
MenuLinkItem.displayName = 'MenuLinkItem';
