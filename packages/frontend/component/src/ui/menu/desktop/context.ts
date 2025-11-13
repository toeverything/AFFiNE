import { createContext } from 'react';

interface DesktopMenuContextValue {
  type: 'dropdown-menu' | 'context-menu';
}

export const DesktopMenuContext = createContext<DesktopMenuContextValue>({
  type: 'dropdown-menu',
});
