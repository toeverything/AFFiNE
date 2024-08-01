import { IconButton, Loading } from '@affine/component';
import {
  appSidebarFloatingAtom,
  appSidebarOpenAtom,
  appSidebarResizingAtom,
} from '@affine/core/components/app-sidebar';
import { appSidebarWidthAtom } from '@affine/core/components/app-sidebar/index.jotai';
import { WindowsAppControls } from '@affine/core/components/pure/header/windows-app-controls';
import { useAsyncCallback } from '@affine/core/hooks/affine-async-hooks';
import { apis, events } from '@affine/electron-api';
import { CloseIcon, PlusIcon, RightSidebarIcon } from '@blocksuite/icons/rc';
import {
  useLiveData,
  useService,
  useServiceOptional,
} from '@toeverything/infra';
import clsx from 'clsx';
import { useAtomValue } from 'jotai';
import { partition } from 'lodash-es';
import {
  Fragment,
  type MouseEventHandler,
  type ReactNode,
  useEffect,
  useState,
} from 'react';

import { iconNameToIcon } from '../../workbench/constants';
import { DesktopStateSynchronizer } from '../../workbench/services/desktop-state-synchronizer';
import {
  AppTabsHeaderService,
  type TabStatus,
} from '../services/app-tabs-header-service';
import * as styles from './styles.css';

const WorkbenchTab = ({
  workbench,
  active: tabActive,
  tabsLength,
}: {
  workbench: TabStatus;
  active: boolean;
  tabsLength: number;
}) => {
  useServiceOptional(DesktopStateSynchronizer);
  const tabsHeaderService = useService(AppTabsHeaderService);
  const activeViewIndex = workbench.activeViewIndex ?? 0;
  const onContextMenu = useAsyncCallback(
    async (viewIdx: number) => {
      await tabsHeaderService.showContextMenu(workbench.id, viewIdx);
    },
    [tabsHeaderService, workbench.id]
  );
  const onActivateView = useAsyncCallback(
    async (viewIdx: number) => {
      await tabsHeaderService.activateView(workbench.id, viewIdx);
    },
    [tabsHeaderService, workbench.id]
  );
  const onCloseTab: MouseEventHandler = useAsyncCallback(
    async e => {
      e.stopPropagation();

      await tabsHeaderService.closeTab(workbench.id);
    },
    [tabsHeaderService, workbench.id]
  );

  return (
    <div
      key={workbench.id}
      data-testid="workbench-tab"
      data-active={tabActive}
      data-pinned={workbench.pinned}
      className={styles.tab}
    >
      {workbench.views.map((view, viewIdx) => {
        return (
          <Fragment key={view.id}>
            <button
              key={view.id}
              data-testid="split-view-label"
              className={styles.splitViewLabel}
              data-active={activeViewIndex === viewIdx && tabActive}
              onContextMenu={() => {
                onContextMenu(viewIdx);
              }}
              onClick={e => {
                e.stopPropagation();
                onActivateView(viewIdx);
              }}
            >
              <div className={styles.labelIcon}>
                {workbench.ready || !workbench.loaded ? (
                  iconNameToIcon[view.iconName ?? 'allDocs']
                ) : (
                  <Loading />
                )}
              </div>
              {workbench.pinned || !view.title ? null : (
                <div title={view.title} className={styles.splitViewLabelText}>
                  {view.title}
                </div>
              )}
            </button>

            {viewIdx !== workbench.views.length - 1 ? (
              <div className={styles.splitViewSeparator} />
            ) : null}
          </Fragment>
        );
      })}
      <div className={styles.tabCloseButtonWrapper}>
        {!workbench.pinned && tabsLength > 1 ? (
          <button
            data-testid="close-tab-button"
            className={styles.tabCloseButton}
            onClick={onCloseTab}
          >
            <CloseIcon />
          </button>
        ) : null}
      </div>
    </div>
  );
};

const useIsFullScreen = () => {
  const [fullScreen, setFullScreen] = useState(false);

  useEffect(() => {
    apis?.ui
      .isFullScreen()
      .then(setFullScreen)
      .then(() => {
        events?.ui.onFullScreen(setFullScreen);
      })
      .catch(console.error);
  }, []);
  return fullScreen;
};

export const AppTabsHeader = ({
  style,
  mode = 'app',
  className,
  left,
}: {
  style?: React.CSSProperties;
  mode?: 'app' | 'shell';
  className?: string;
  left?: ReactNode;
}) => {
  const sidebarWidth = useAtomValue(appSidebarWidthAtom);
  const sidebarOpen = useAtomValue(appSidebarOpenAtom);
  const sidebarFloating = useAtomValue(appSidebarFloatingAtom);
  const sidebarResizing = useAtomValue(appSidebarResizingAtom);
  const isMacosDesktop = environment.isDesktop && environment.isMacOs;
  const fullScreen = useIsFullScreen();

  const tabsHeaderService = useService(AppTabsHeaderService);
  const tabs = useLiveData(tabsHeaderService.tabsStatus$);

  const [pinned, unpinned] = partition(tabs, tab => tab.pinned);

  const onAddTab = useAsyncCallback(async () => {
    await tabsHeaderService.onAddTab();
  }, [tabsHeaderService]);

  const onToggleRightSidebar = useAsyncCallback(async () => {
    await tabsHeaderService.onToggleRightSidebar();
  }, [tabsHeaderService]);

  useEffect(() => {
    if (mode === 'app') {
      apis?.ui.pingAppLayoutReady().catch(console.error);
    }
  }, [mode]);

  return (
    <div
      className={clsx(styles.root, className)}
      style={style}
      data-mode={mode}
      data-is-windows={environment.isDesktop && environment.isWindows}
    >
      <div
        style={{
          transition: sidebarResizing ? 'none' : undefined,
          paddingLeft:
            isMacosDesktop && sidebarOpen && !sidebarFloating && !fullScreen
              ? 90
              : 16,
          width: sidebarOpen && !sidebarFloating ? sidebarWidth : 130,
          // minus 16 to account for the padding on the right side of the header (for box shadow)
          marginRight: sidebarOpen && !sidebarFloating ? -16 : 0,
        }}
        className={styles.headerLeft}
      >
        {left}
      </div>
      <div className={styles.tabs}>
        {pinned.map(tab => {
          return (
            <WorkbenchTab
              tabsLength={pinned.length}
              key={tab.id}
              workbench={tab}
              active={tab.active}
            />
          );
        })}
        {pinned.length > 0 && unpinned.length > 0 && (
          <div className={styles.pinSeparator} />
        )}
        {unpinned.map(workbench => {
          return (
            <WorkbenchTab
              tabsLength={tabs.length}
              key={workbench.id}
              workbench={workbench}
              active={workbench.active}
            />
          );
        })}
        <IconButton onClick={onAddTab} data-testid="add-tab-view-button">
          <PlusIcon />
        </IconButton>
      </div>
      <div className={styles.spacer} />
      <IconButton size="large" onClick={onToggleRightSidebar}>
        <RightSidebarIcon />
      </IconButton>
      {environment.isDesktop && environment.isWindows ? (
        <WindowsAppControls />
      ) : null}
    </div>
  );
};
