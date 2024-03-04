import { ResizePanel } from '@affine/component/resize-panel';
import { appSettingAtom } from '@toeverything/infra/atom';
import { useService } from '@toeverything/infra/di';
import { useLiveData } from '@toeverything/infra/livedata';
import { useAtomValue } from 'jotai';
import { useCallback, useState } from 'react';

import { RightSidebar } from '../entities/right-sidebar';
import * as styles from './container.css';
import { Header } from './header';

const MIN_SIDEBAR_WIDTH = 320;
const MAX_SIDEBAR_WIDTH = 800;

export const RightSidebarContainer = () => {
  const { clientBorder } = useAtomValue(appSettingAtom);
  const [width, setWidth] = useState(300);
  const [resizing, setResizing] = useState(false);
  const rightSidebar = useService(RightSidebar);

  const frontView = useLiveData(rightSidebar.front);
  const open = useLiveData(rightSidebar.isOpen) && frontView !== undefined;

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        rightSidebar.open();
      } else {
        rightSidebar.close();
      }
    },
    [rightSidebar]
  );

  const handleToggleOpen = useCallback(() => {
    rightSidebar.toggle();
  }, [rightSidebar]);

  return (
    <ResizePanel
      resizeHandlePos="left"
      resizeHandleOffset={clientBorder ? 4 : 0}
      width={width}
      resizing={resizing}
      onResizing={setResizing}
      className={styles.sidebarContainer}
      data-client-border={clientBorder && open}
      open={open}
      onOpen={handleOpenChange}
      onWidthChange={setWidth}
      minWidth={MIN_SIDEBAR_WIDTH}
      maxWidth={MAX_SIDEBAR_WIDTH}
    >
      {frontView && (
        <div className={styles.sidebarContainerInner}>
          <Header
            floating={false}
            onToggle={handleToggleOpen}
            view={frontView}
          />
          <frontView.body.Target
            className={styles.sidebarBodyTarget}
          ></frontView.body.Target>
        </div>
      )}
    </ResizePanel>
  );
};
