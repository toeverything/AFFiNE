import { IconButton } from '@affine/component';
import { RightSidebarIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import { useAtomValue } from 'jotai';
import { Suspense, useCallback } from 'react';
import { Outlet } from 'react-router-dom';

import { AffineErrorBoundary } from '../../../components/affine/affine-error-boundary';
import { appSidebarOpenAtom } from '../../../components/app-sidebar/index.jotai';
import { SidebarSwitch } from '../../../components/app-sidebar/sidebar-header/sidebar-switch';
import { ViewService } from '../services/view';
import { WorkbenchService } from '../services/workbench';
import * as styles from './route-container.css';
import { useViewPosition } from './use-view-position';
import { ViewBodyTarget, ViewHeaderTarget } from './view-islands';

export interface Props {
  route: {
    Component: React.ComponentType;
  };
}

const ToggleButton = ({
  onToggle,
  className,
  show,
}: {
  onToggle?: () => void;
  className: string;
  show: boolean;
}) => {
  return (
    <IconButton
      size="24"
      onClick={onToggle}
      className={className}
      data-show={show}
    >
      <RightSidebarIcon />
    </IconButton>
  );
};

export const RouteContainer = () => {
  const viewPosition = useViewPosition();
  const leftSidebarOpen = useAtomValue(appSidebarOpenAtom);
  const workbench = useService(WorkbenchService).workbench;
  const view = useService(ViewService).view;
  const sidebarOpen = useLiveData(workbench.sidebarOpen$);
  const handleToggleSidebar = useCallback(() => {
    workbench.toggleSidebar();
  }, [workbench]);

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        {!BUILD_CONFIG.isElectron && viewPosition.isFirst && (
          <SidebarSwitch
            show={!leftSidebarOpen}
            className={styles.leftSidebarButton}
          />
        )}
        <ViewHeaderTarget
          viewId={view.id}
          className={styles.viewHeaderContainer}
        />
        {!BUILD_CONFIG.isElectron && viewPosition.isLast && (
          <ToggleButton
            show={!sidebarOpen}
            className={styles.rightSidebarButton}
            onToggle={handleToggleSidebar}
          />
        )}
      </div>

      <AffineErrorBoundary>
        <Suspense>
          <Outlet />
        </Suspense>
      </AffineErrorBoundary>
      <ViewBodyTarget viewId={view.id} className={styles.viewBodyContainer} />
    </div>
  );
};
