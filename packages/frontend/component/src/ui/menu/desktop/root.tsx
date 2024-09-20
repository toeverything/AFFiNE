import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import clsx from 'clsx';
import React from 'react';

import type { MenuProps } from '../menu.types';
import * as styles from '../styles.css';
import * as desktopStyles from './styles.css';

export const DesktopMenu = ({
  children,
  items,
  noPortal,
  portalOptions,
  rootOptions: { defaultOpen, modal, ...rootOptions } = {},
  contentOptions: {
    className = '',
    style: contentStyle = {},
    ...otherContentOptions
  } = {},
}: MenuProps) => {
  const ContentWrapper = noPortal ? React.Fragment : DropdownMenu.Portal;
  return (
    <DropdownMenu.Root
      defaultOpen={defaultOpen}
      modal={modal ?? false}
      {...rootOptions}
    >
      <DropdownMenu.Trigger
        asChild
        onClick={e => {
          e.stopPropagation();
          e.preventDefault();
        }}
      >
        {children}
      </DropdownMenu.Trigger>

      <ContentWrapper {...portalOptions}>
        <DropdownMenu.Content
          className={clsx(
            styles.menuContent,
            desktopStyles.contentAnimation,
            className
          )}
          sideOffset={4}
          align="start"
          style={{ zIndex: 'var(--affine-z-index-popover)', ...contentStyle }}
          {...otherContentOptions}
        >
          {items}
        </DropdownMenu.Content>
      </ContentWrapper>
    </DropdownMenu.Root>
  );
};
