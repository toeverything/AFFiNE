export * from './menu.types';
import { DesktopMenuItem } from './desktop/item';
import { DesktopMenu } from './desktop/root';
import { DesktopMenuSeparator } from './desktop/separator';
import { DesktopMenuSub } from './desktop/sub';
import { MenuTrigger } from './menu-trigger';
import { MobileMenuItem } from './mobile/item';
import { MobileMenu } from './mobile/root';
import { MobileMenuSeparator } from './mobile/separator';
import { MobileMenuSub } from './mobile/sub';

const MenuItem = environment.isMobileEdition ? MobileMenuItem : DesktopMenuItem;
const MenuSeparator = environment.isMobileEdition
  ? MobileMenuSeparator
  : DesktopMenuSeparator;
const MenuSub = environment.isMobileEdition ? MobileMenuSub : DesktopMenuSub;
const Menu = environment.isMobileEdition ? MobileMenu : DesktopMenu;

export {
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
