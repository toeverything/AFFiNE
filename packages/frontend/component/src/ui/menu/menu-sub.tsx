import { ArrowRightSmallIcon } from '@blocksuite/icons';
import type {
  DropdownMenuSubProps,
  MenuPortalProps,
  MenuSubContentProps,
} from '@radix-ui/react-dropdown-menu';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import clsx from 'clsx';
import type { ReactNode } from 'react';
import { useMemo } from 'react';

import { MenuIcon } from './menu-icon';
import type { MenuItemProps } from './menu-item';
import * as styles from './styles.css';
import { useMenuItem } from './use-menu-item';
export interface MenuSubProps {
  children: ReactNode;
  items: ReactNode;
  triggerOptions?: Omit<MenuItemProps, 'onSelect' | 'children'>;
  portalOptions?: Omit<MenuPortalProps, 'children'>;
  subOptions?: Omit<DropdownMenuSubProps, 'children'>;
  subContentOptions?: Omit<MenuSubContentProps, 'children'>;
}

export const MenuSub = ({
  children: propsChildren,
  items,
  portalOptions,
  subOptions,
  triggerOptions: {
    className: propsClassName,
    preFix,
    endFix,
    type,
    ...otherTriggerOptions
  } = {},
  subContentOptions: {
    className: subContentClassName = '',
    ...otherSubContentOptions
  } = {},
}: MenuSubProps) => {
  const { className, children } = useMenuItem({
    children: propsChildren,
    className: propsClassName,
    type,
    preFix,
    endFix,
  });

  return (
    <DropdownMenu.Sub {...subOptions}>
      <DropdownMenu.SubTrigger className={className} {...otherTriggerOptions}>
        {children}
        <MenuIcon position="end">
          <ArrowRightSmallIcon />
        </MenuIcon>
      </DropdownMenu.SubTrigger>
      <DropdownMenu.Portal {...portalOptions}>
        <DropdownMenu.SubContent
          sideOffset={10}
          className={useMemo(
            () => clsx(styles.menuContent, subContentClassName),
            [subContentClassName]
          )}
          {...otherSubContentOptions}
        >
          {items}
        </DropdownMenu.SubContent>
      </DropdownMenu.Portal>
    </DropdownMenu.Sub>
  );
};
