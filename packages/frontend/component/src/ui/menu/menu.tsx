import type {
  DropdownMenuContentProps,
  DropdownMenuPortalProps,
  DropdownMenuProps,
} from '@radix-ui/react-dropdown-menu';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import clsx from 'clsx';
import type { ReactNode } from 'react';

import * as styles from './styles.css';

export interface MenuProps {
  children: ReactNode;
  items: ReactNode;
  portalOptions?: Omit<DropdownMenuPortalProps, 'children'>;
  rootOptions?: Omit<DropdownMenuProps, 'children'>;
  contentOptions?: Omit<DropdownMenuContentProps, 'children'>;
  noPortal?: boolean;
}

export const Menu = ({
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
  return (
    <DropdownMenu.Root {...rootOptions}>
      <DropdownMenu.Trigger asChild>{children}</DropdownMenu.Trigger>

      {noPortal ? (
        <DropdownMenu.Content
          className={clsx(styles.menuContent, className)}
          sideOffset={5}
          align="start"
          style={{ zIndex: 'var(--affine-z-index-popover)', ...contentStyle }}
          {...otherContentOptions}
        >
          {items}
        </DropdownMenu.Content>
      ) : (
        <DropdownMenu.Portal {...portalOptions}>
          <DropdownMenu.Content
            className={clsx(styles.menuContent, className)}
            sideOffset={5}
            align="start"
            style={{ zIndex: 'var(--affine-z-index-popover)', ...contentStyle }}
            {...otherContentOptions}
          >
            {items}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      )}
    </DropdownMenu.Root>
  );
};
