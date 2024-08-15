import {
  createContext,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';

import type { MenuSubProps } from '../menu.types';

export type SubMenuContent = {
  items: ReactNode;
  contentOptions?: MenuSubProps['subContentOptions'];
};

export const MobileMenuContext = createContext<{
  subMenus: Array<SubMenuContent>;
  setSubMenus: Dispatch<SetStateAction<Array<SubMenuContent>>>;
  setOpen?: (v: boolean) => void;
}>({
  subMenus: [],
  setSubMenus: () => {},
});
