import { IconButton } from '@affine/component';
import {
  appSidebarOpenAtom,
  SidebarSwitch,
} from '@affine/component/app-sidebar';
import { RightSidebarIcon } from '@blocksuite/icons';
import { useLiveData } from '@toeverything/infra';
import { useService } from '@toeverything/infra/di';
import { useAtomValue } from 'jotai';
import { Suspense, useCallback } from 'react';

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
  const handleToggleRightSidebar = useCallback(() => {
    rightSidebar.toggle();
  }, [rightSidebar]);
  return (
    <div className={styles.root}>
      <div className={styles.header}>
        {viewPosition.isFirst && !leftSidebarOpen && (
          <SidebarSwitch className={styles.leftSidebarButton} />
        )}
        <view.header.Target className={styles.viewHeaderContainer} />
        {viewPosition.isLast && !rightSidebarOpen && (
          <ToggleButton
            className={styles.rightSidebarButton}
            onToggle={handleToggleRightSidebar}
          />
        )}
      </div>
      <view.body.Target className={styles.viewBodyContainer} />
      <Suspense fallback={<>loading</>}>
        <route.Component />
      </Suspense>
    </div>
  );
};
