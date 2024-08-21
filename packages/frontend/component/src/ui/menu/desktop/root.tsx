import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import clsx from 'clsx';
import { Fragment } from 'react';

import type { MenuProps } from '../menu.types';
import * as styles from '../styles.css';

export const DesktopMenu = ({
  children,
  items,
  portalOptions,
  rootOptions,
  noPortal,
  contentOptions: {
    className = '',
    style: contentStyle = {},
    ...otherContentOptions
  } = {},
}: MenuProps) => {
  const Wrapper = noPortal ? Fragment : DropdownMenu.Portal;
  const wrapperProps = noPortal ? {} : portalOptions;
  return (
    <DropdownMenu.Root {...rootOptions}>
      <DropdownMenu.Trigger asChild>{children}</DropdownMenu.Trigger>

      <Wrapper {...wrapperProps}>
        <DropdownMenu.Content
          className={clsx(styles.menuContent, className)}
          sideOffset={5}
          align="start"
          style={{ zIndex: 'var(--affine-z-index-popover)', ...contentStyle }}
          {...otherContentOptions}
        >
          {items}
        </DropdownMenu.Content>
      </Wrapper>
    </DropdownMenu.Root>
  );
};
