import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import clsx from 'clsx';

import type { MenuProps } from '../menu.types';
import * as styles from '../styles.css';
import * as desktopStyles from './styles.css';

export const DesktopMenu = ({
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
          className={clsx(
            styles.menuContent,
            desktopStyles.contentAnimation,
            className
          )}
          sideOffset={5}
          align="start"
          style={{ zIndex: 'var(--affine-z-index-popover)', ...contentStyle }}
          {...otherContentOptions}
          side="bottom"
        >
          {items}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
};
