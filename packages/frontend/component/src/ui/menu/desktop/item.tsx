import * as DropdownMenu from '@radix-ui/react-dropdown-menu';

import type { MenuItemProps } from '../menu.types';
import { useMenuItem } from '../use-menu-item';

export const DesktopMenuItem = (props: MenuItemProps) => {
  const { className, children, otherProps } = useMenuItem(props);
  return (
    <DropdownMenu.Item className={className} {...otherProps}>
      {children}
    </DropdownMenu.Item>
  );
};
