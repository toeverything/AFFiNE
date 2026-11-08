import { MobileMenu } from '@affine/component';
import type { NodeOperation } from '@affine/core/desktop/components/navigation-panel';
import { WorkbenchService } from '@affine/core/modules/workbench';
import { useLiveData, useService } from '@toeverything/infra';
import {
  createContext,
  Fragment,
  type PropsWithChildren,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

type MenuHostContextValue = {
  open(items: ReactNode): void;
  close(): void;
};

const MenuHostContext = createContext<MenuHostContextValue | null>(null);

export const useMobileNavigationMenuHost = () => {
  const context = useContext(MenuHostContext);
  if (!context) {
    throw new Error('MobileNavigationMenuHost is not mounted');
  }
  return context;
};

export const MobileNavigationMenuItems = ({
  operations,
}: {
  operations: NodeOperation[];
}) => (
  <>
    {[...operations]
      .sort((a, b) => a.index - b.index)
      .filter(operation => !operation.inline)
      .map(({ view, index }) => (
        <Fragment key={index}>{view}</Fragment>
      ))}
  </>
);

export const MobileNavigationMenuHost = ({ children }: PropsWithChildren) => {
  const location = useLiveData(
    useService(WorkbenchService).workbench.location$
  );
  const [items, setItems] = useState<ReactNode>(null);
  const close = useCallback(() => setItems(null), []);
  const value = useMemo<MenuHostContextValue>(
    () => ({ open: setItems, close }),
    [close]
  );

  useEffect(() => close(), [close, location.pathname]);

  return (
    <MenuHostContext.Provider value={value}>
      {children}
      <MobileMenu
        rootOptions={{
          open: items !== null,
          onOpenChange: open => !open && close(),
        }}
        items={items}
      >
        <span hidden />
      </MobileMenu>
    </MenuHostContext.Provider>
  );
};
