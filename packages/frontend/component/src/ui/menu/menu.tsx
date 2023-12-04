import type {
  DropdownMenuProps,
  MenuContentProps,
  MenuPortalProps,
} from '@radix-ui/react-dropdown-menu';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import clsx from 'clsx';
import type { ReactNode } from 'react';
import { useMemo } from 'react';

import * as styles from './styles.css';

export interface MenuProps {
  children: ReactNode;
  items: ReactNode;
  portalOptions?: Omit<MenuPortalProps, 'children'>;
  rootOptions?: Omit<DropdownMenuProps, 'children'>;
  contentOptions?: Omit<MenuContentProps, 'children'>;
}

export const Menu = ({
  children,
  items,
  portalOptions,
  rootOptions,
  contentOptions: {
    className = '',
    style: contentStyle = {},
    ...otherContentOptions
  } = {},
}: MenuProps) => {
  return (
    <DropdownMenu.Root {...rootOptions}>
      <DropdownMenu.Trigger asChild>{children}</DropdownMenu.Trigger>

      <DropdownMenu.Portal {...portalOptions}>
        <DropdownMenu.Content
          className={useMemo(
            () => clsx(styles.menuContent, className),
            [className]
          )}
          sideOffset={5}
          align="start"
          style={{ zIndex: 'var(--affine-z-index-popover)', ...contentStyle }}
          {...otherContentOptions}
        >
          {items}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
};
