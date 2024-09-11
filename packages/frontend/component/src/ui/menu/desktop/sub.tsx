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
  subOptions: { defaultOpen, ...otherSubOptions } = {},
  triggerOptions,
  subContentOptions: {
    className: subContentClassName = '',
    style: contentStyle,
    ...otherSubContentOptions
  } = {},
}: MenuSubProps) => {
  const { className, children, otherProps } = useMenuItem({
    ...triggerOptions,
    children: propsChildren,
    suffixIcon: <ArrowRightSmallIcon />,
  });

  return (
    <DropdownMenu.Sub defaultOpen={defaultOpen} {...otherSubOptions}>
      <DropdownMenu.SubTrigger className={className} {...otherProps}>
        {children}
      </DropdownMenu.SubTrigger>
      <DropdownMenu.Portal {...portalOptions}>
        <DropdownMenu.SubContent
          className={useMemo(
            () => clsx(styles.menuContent, subContentClassName),
            [subContentClassName]
          )}
          style={{ zIndex: 'var(--affine-z-index-popover)', ...contentStyle }}
          {...otherSubContentOptions}
        >
          {items}
        </DropdownMenu.SubContent>
      </DropdownMenu.Portal>
    </DropdownMenu.Sub>
  );
};
