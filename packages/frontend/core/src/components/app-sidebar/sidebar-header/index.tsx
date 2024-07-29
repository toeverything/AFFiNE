import { useAtomValue } from 'jotai';

import { navHeaderStyle } from '../index.css';
import { appSidebarOpenAtom } from '../index.jotai';
import { SidebarSwitch } from './sidebar-switch';

export const SidebarHeader = () => {
  const open = useAtomValue(appSidebarOpenAtom);

  return (
    <div className={navHeaderStyle} data-open={open}>
      <SidebarSwitch show={open} />
    </div>
  );
};

export * from './sidebar-switch';
