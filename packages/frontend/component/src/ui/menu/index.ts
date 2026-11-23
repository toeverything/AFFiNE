export * from './menu.types';
import { ContextMenu } from './desktop/context-menu';
import { DesktopMenuItem } from './desktop/item';
import { DesktopMenu } from './desktop/root';
import { DesktopMenuSeparator } from './desktop/separator';
import { DesktopMenuSub } from './desktop/sub';
import { MenuTrigger } from './menu-trigger';
import { MobileMenuItem } from './mobile/item';
import { MobileMenu } from './mobile/root';
import { MobileMenuSeparator } from './mobile/separator';
import { MobileMenuSub } from './mobile/sub';

const MenuItem = BUILD_CONFIG.isMobileEdition
  ? MobileMenuItem
  : DesktopMenuItem;
const MenuSeparator = BUILD_CONFIG.isMobileEdition
  ? MobileMenuSeparator
  : DesktopMenuSeparator;
const MenuSub = BUILD_CONFIG.isMobileEdition ? MobileMenuSub : DesktopMenuSub;
const Menu = BUILD_CONFIG.isMobileEdition ? MobileMenu : DesktopMenu;

export {
  ContextMenu,
  DesktopMenu,
  DesktopMenuItem,
  DesktopMenuSeparator,
  DesktopMenuSub,
  MobileMenu,
  MobileMenuItem,
  MobileMenuSeparator,
  MobileMenuSub,
};

export { Menu, MenuItem, MenuSeparator, MenuSub, MenuTrigger };
export * from './mobile/hook';
