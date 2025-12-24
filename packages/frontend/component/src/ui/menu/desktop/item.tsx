import * as ContextMenu from '@radix-ui/react-context-menu';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useContext } from 'react';

import type { MenuItemProps } from '../menu.types';
import { useMenuItem } from '../use-menu-item';
import { DesktopMenuContext } from './context';

export const DesktopMenuItem = (props: MenuItemProps) => {
  const { type } = useContext(DesktopMenuContext);
  const { className, children, otherProps } = useMenuItem(props);

  if (type === 'dropdown-menu') {
    return (
      <DropdownMenu.Item className={className} {...otherProps}>
        {children}
      </DropdownMenu.Item>
    );
  }

  if (type === 'context-menu') {
    return (
      <ContextMenu.Item className={className} {...otherProps}>
        {children}
      </ContextMenu.Item>
    );
  }

  return null;
};
