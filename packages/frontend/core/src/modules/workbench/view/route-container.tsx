import { IconButton } from '@affine/component';
import { WindowsAppControls } from '@affine/core/components/pure/header/windows-app-controls';
import { RightSidebarIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import { useAtomValue } from 'jotai';
import { Suspense, useCallback } from 'react';

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
      size="large"
      onClick={onToggle}
      className={className}
      data-show={show}
    >
      <RightSidebarIcon />
    </IconButton>
  );
};

export const RouteContainer = ({ route }: Props) => {
  const viewPosition = useViewPosition();
  const leftSidebarOpen = useAtomValue(appSidebarOpenAtom);
  const workbench = useService(WorkbenchService).workbench;
  const view = useService(ViewService).view;
  const sidebarOpen = useLiveData(workbench.sidebarOpen$);
  const handleToggleSidebar = useCallback(() => {
    workbench.toggleSidebar();
  }, [workbench]);
  const isWindowsDesktop = environment.isDesktop && environment.isWindows;

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        {viewPosition.isFirst && (
          <SidebarSwitch
            show={!leftSidebarOpen}
            className={styles.leftSidebarButton}
          />
        )}
        <ViewHeaderTarget
          viewId={view.id}
          className={styles.viewHeaderContainer}
        />
        {viewPosition.isLast && (
          <>
            <ToggleButton
              show={!sidebarOpen}
              className={styles.rightSidebarButton}
              onToggle={handleToggleSidebar}
            />
            {isWindowsDesktop && !sidebarOpen && (
              <div className={styles.windowsAppControlsContainer}>
                <WindowsAppControls />
              </div>
            )}
          </>
        )}
      </div>

      <AffineErrorBoundary>
        <Suspense>
          <route.Component />
        </Suspense>
      </AffineErrorBoundary>
      <ViewBodyTarget viewId={view.id} className={styles.viewBodyContainer} />
    </div>
  );
};
