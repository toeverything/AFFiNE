import { IconButton } from '@affine/component';
import { WindowsAppControls } from '@affine/core/components/pure/header/windows-app-controls';
import { RightSidebarIcon } from '@blocksuite/icons';
import { useLiveData } from '@toeverything/infra';
import { useService } from '@toeverything/infra/di';
import { useAtomValue } from 'jotai';
import { Suspense, useCallback } from 'react';

import {
  appSidebarOpenAtom,
  SidebarSwitch,
} from '../../../components/app-sidebar';
import { RightSidebar } from '../../right-sidebar';
import * as styles from './route-container.css';
import { useView } from './use-view';
import { useViewPosition } from './use-view-position';

export interface Props {
  route: {
    Component: React.ComponentType;
  };
}

const ToggleButton = ({
  onToggle,
  className,
}: {
  onToggle?: () => void;
  className: string;
}) => {
  return (
    <IconButton size="large" onClick={onToggle} className={className}>
      <RightSidebarIcon />
    </IconButton>
  );
};

export const RouteContainer = ({ route }: Props) => {
  const view = useView();
  const viewPosition = useViewPosition();
  const leftSidebarOpen = useAtomValue(appSidebarOpenAtom);
  const rightSidebar = useService(RightSidebar);
  const rightSidebarOpen = useLiveData(rightSidebar.isOpen);
  const rightSidebarHasViews = useLiveData(rightSidebar.hasViews);
  const handleToggleRightSidebar = useCallback(() => {
    rightSidebar.toggle();
  }, [rightSidebar]);
  const isWindowsDesktop = environment.isDesktop && environment.isWindows;
  return (
    <div className={styles.root}>
      <div className={styles.header}>
        {viewPosition.isFirst && !leftSidebarOpen && (
          <SidebarSwitch className={styles.leftSidebarButton} />
        )}
        <view.header.Target className={styles.viewHeaderContainer} />
        {viewPosition.isLast && !rightSidebarOpen && rightSidebarHasViews && (
          <>
            <ToggleButton
              className={styles.rightSidebarButton}
              onToggle={handleToggleRightSidebar}
            />
            {isWindowsDesktop && (
              <div className={styles.windowsAppControlsContainer}>
                <WindowsAppControls />
              </div>
            )}
          </>
        )}
      </div>
      <view.body.Target className={styles.viewBodyContainer} />
      <Suspense>
        <route.Component />
      </Suspense>
    </div>
  );
};
