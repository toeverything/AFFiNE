export * from './menu.types';
import { isMobile } from '../../utils/env';
import { DesktopMenuItem } from './desktop/item';
import { DesktopMenu } from './desktop/root';
import { DesktopMenuSeparator } from './desktop/separator';
import { DesktopMenuSub } from './desktop/sub';
import { MenuTrigger } from './menu-trigger';
import { MobileMenuItem } from './mobile/item';
import { MobileMenu } from './mobile/root';
import { MobileMenuSeparator } from './mobile/separator';
import { MobileMenuSub } from './mobile/sub';

const MenuItem = isMobile() ? MobileMenuItem : DesktopMenuItem;
const MenuSeparator = isMobile() ? MobileMenuSeparator : DesktopMenuSeparator;
const MenuSub = isMobile() ? MobileMenuSub : DesktopMenuSub;
const Menu = isMobile() ? MobileMenu : DesktopMenu;

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
