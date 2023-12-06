import * as DropdownMenu from '@radix-ui/react-dropdown-menu';

import type { MenuItemProps } from './menu.types';
import { useMenuItem } from './use-menu-item';

export const MenuItem = ({
  children: propsChildren,
  type = 'default',
  className: propsClassName,
  preFix,
  endFix,
  checked,
  selected,
  block,
  ...otherProps
}: MenuItemProps) => {
  const { className, children } = useMenuItem({
    children: propsChildren,
    className: propsClassName,
    type,
    preFix,
    endFix,
    checked,
    selected,
    block,
  });

  return (
    <DropdownMenu.Item className={className} {...otherProps}>
      {children}
    </DropdownMenu.Item>
  );
};
