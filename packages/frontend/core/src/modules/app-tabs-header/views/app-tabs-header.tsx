import { IconButton, Loading, observeResize } from '@affine/component';
import { WindowsAppControls } from '@affine/core/components/pure/header/windows-app-controls';
import { useAsyncCallback } from '@affine/core/hooks/affine-async-hooks';
import { DesktopStateSynchronizer } from '@affine/core/modules/workbench/services/desktop-state-synchronizer';
import type { WorkbenchMeta } from '@affine/electron-api';
import { apis } from '@affine/electron-api';
import {
  CloseIcon,
  DeleteIcon,
  EdgelessIcon,
  FolderIcon,
  PageIcon,
  PlusIcon,
  RightSidebarIcon,
  TagIcon,
  TodayIcon,
  ViewLayersIcon,
} from '@blocksuite/icons/rc';
import {
  useLiveData,
  useService,
  useServiceOptional,
} from '@toeverything/infra';
import { debounce, partition } from 'lodash-es';
import {
  Fragment,
  type MouseEventHandler,
  type ReactNode,
  useEffect,
  useRef,
} from 'react';

import {
  AppTabsHeaderService,
  type TabStatus,
} from '../services/app-tabs-header-service';
import * as styles from './styles.css';

type ModuleName = NonNullable<WorkbenchMeta['views'][0]['moduleName']>;

const moduleNameToIcon = {
  all: <FolderIcon />,
  collection: <ViewLayersIcon />,
  doc: <PageIcon />,
  page: <PageIcon />,
  edgeless: <EdgelessIcon />,
  journal: <TodayIcon />,
  tag: <TagIcon />,
  trash: <DeleteIcon />,
} satisfies Record<ModuleName, ReactNode>;

const WorkbenchTab = ({
  workbench,
  active: tabActive,
  tabsLength,
}: {
  workbench: TabStatus;
  active: boolean;
  tabsLength: number;
}) => {
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
      data-active={tabActive}
      data-pinned={workbench.pinned}
      className={styles.tab}
    >
      {workbench.views.map((view, viewIdx) => {
        return (
          <Fragment key={view.id}>
            <button
              key={view.id}
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
                  moduleNameToIcon[view.moduleName ?? 'all']
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
      {!workbench.pinned && tabsLength > 1 ? (
        <div className={styles.tabCloseButtonWrapper}>
          <button className={styles.tabCloseButton} onClick={onCloseTab}>
            <CloseIcon />
          </button>
        </div>
      ) : null}
    </div>
  );
};

export const AppTabsHeader = ({
  style,
  reportBoundingUpdate,
}: {
  style?: React.CSSProperties;
  reportBoundingUpdate?: boolean;
}) => {
  const tabsHeaderService = useService(AppTabsHeaderService);
  const tabs = useLiveData(tabsHeaderService.tabsStatus$);

  const [pinned, unpinned] = partition(tabs, tab => tab.pinned);

  const onAddTab = useAsyncCallback(async () => {
    await tabsHeaderService.onAddTab();
  }, [tabsHeaderService]);

  const onToggleRightSidebar = useAsyncCallback(async () => {
    await tabsHeaderService.onToggleRightSidebar();
  }, [tabsHeaderService]);

  const ref = useRef<HTMLDivElement | null>(null);

  useServiceOptional(DesktopStateSynchronizer);

  useEffect(() => {
    if (ref.current && reportBoundingUpdate) {
      return observeResize(
        ref.current,
        debounce(() => {
          if (document.visibilityState === 'visible') {
            const rect = ref.current?.getBoundingClientRect();
            if (!rect) {
              return;
            }
            const toInt = (value: number) => Math.round(value);
            const boundRect = {
              height: toInt(rect.height),
              width: toInt(rect.width),
              x: toInt(rect.x),
              y: toInt(rect.y),
            };
            apis?.ui.updateTabsBoundingRect(boundRect).catch(console.error);
          }
        }, 50)
      );
    }
    return;
  }, [reportBoundingUpdate]);

  return (
    <div
      className={styles.root}
      ref={ref}
      style={style}
      data-is-windows={environment.isDesktop && environment.isWindows}
    >
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
        <IconButton onClick={onAddTab}>
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
