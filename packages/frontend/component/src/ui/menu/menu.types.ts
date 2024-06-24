import type { DropdownMenuItemProps as MenuItemPropsPrimitive } from '@radix-ui/react-dropdown-menu';

export interface MenuItemProps
  extends Omit<MenuItemPropsPrimitive, 'asChild' | 'textValue'> {
  type?: 'default' | 'warning' | 'danger';
  preFix?: React.ReactNode;
  endFix?: React.ReactNode;
  checked?: boolean;
  selected?: boolean;
  block?: boolean;
}
