import { ArrowRightSmallIcon } from '@blocksuite/icons/rc';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import clsx from 'clsx';
import { useMemo } from 'react';

import type { MenuSubProps } from '../menu.types';
import * as styles from '../styles.css';
import { useMenuItem } from '../use-menu-item';

export const DesktopMenuSub = ({
  children: propsChildren,
  items,
  portalOptions,
  subOptions,
  triggerOptions,
  subContentOptions: {
    className: subContentClassName = '',
    ...otherSubContentOptions
  } = {},
}: MenuSubProps) => {
  const { className, children, otherProps } = useMenuItem({
    ...triggerOptions,
    children: propsChildren,
    suffixIcon: <ArrowRightSmallIcon />,
  });

  return (
    <DropdownMenu.Sub {...subOptions}>
      <DropdownMenu.SubTrigger className={className} {...otherProps}>
        {children}
      </DropdownMenu.SubTrigger>
      <DropdownMenu.Portal {...portalOptions}>
        <DropdownMenu.SubContent
          sideOffset={12}
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
