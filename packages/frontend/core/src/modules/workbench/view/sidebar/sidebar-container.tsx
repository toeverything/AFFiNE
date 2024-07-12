import { useLiveData, useService } from '@toeverything/infra';
import clsx from 'clsx';
import { useCallback } from 'react';

import { ViewService } from '../../services/view';
import { WorkbenchService } from '../../services/workbench';
import { ViewSidebarTabBodyTarget } from '../view-islands';
import * as styles from './sidebar-container.css';
import { Header } from './sidebar-header';
import { SidebarHeaderSwitcher } from './sidebar-header-switcher';

export const SidebarContainer = ({
  className,
  ...props
}: React.HtmlHTMLAttributes<HTMLDivElement>) => {
  const workbenchService = useService(WorkbenchService);
  const workbench = workbenchService.workbench;
  const viewService = useService(ViewService);
  const view = viewService.view;
  const sidebarTabs = useLiveData(view.sidebarTabs$);
  const activeSidebarTab = useLiveData(view.activeSidebarTab$);

  const handleToggleOpen = useCallback(() => {
    workbench.toggleSidebar();
  }, [workbench]);

  const isWindowsDesktop = environment.isDesktop && environment.isWindows;

  return (
    <div className={clsx(styles.sidebarContainerInner, className)} {...props}>
      <Header floating={false} onToggle={handleToggleOpen}>
        {!isWindowsDesktop && sidebarTabs.length > 0 && (
          <SidebarHeaderSwitcher />
        )}
      </Header>
      {isWindowsDesktop && sidebarTabs.length > 0 && <SidebarHeaderSwitcher />}
      {sidebarTabs.length > 0 ? (
        sidebarTabs.map(sidebar => (
          <ViewSidebarTabBodyTarget
            tabId={sidebar.id}
            key={sidebar.id}
            style={{ display: activeSidebarTab === sidebar ? 'block' : 'none' }}
            viewId={view.id}
            className={styles.sidebarBodyTarget}
          />
        ))
      ) : (
        <div className={styles.sidebarBodyNoSelection}>No Selection</div>
      )}
    </div>
  );
};
