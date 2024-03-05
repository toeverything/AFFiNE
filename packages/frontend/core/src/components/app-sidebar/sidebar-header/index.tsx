import { useAtomValue } from 'jotai';

import { NavigationButtons } from '../../../modules/navigation';
import { navHeaderStyle } from '../index.css';
import { appSidebarOpenAtom } from '../index.jotai';
import { SidebarSwitch } from './sidebar-switch';

export const SidebarHeader = () => {
  const open = useAtomValue(appSidebarOpenAtom);

  return (
    <div
      className={navHeaderStyle}
      data-open={open}
      data-is-macos-electron={environment.isDesktop && environment.isMacOs}
    >
      <SidebarSwitch show={open} />
      <NavigationButtons />
    </div>
  );
};

export * from './sidebar-switch';
