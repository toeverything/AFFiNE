import { IconButton } from '@affine/component';
import { apis, events } from '@affine/electron-api';
import {
  CloseIcon,
  DeleteIcon,
  FolderIcon,
  PageIcon,
  PlusIcon,
  TagIcon,
  TodayIcon,
  ViewLayersIcon,
} from '@blocksuite/icons/rc';
import type { TabViewsMetaSchema } from '@toeverything/infra';
import { partition } from 'lodash-es';
import { Fragment, type ReactNode, useEffect, useState } from 'react';

import * as styles from './shell.css';
import { WindowsAppControls } from './windows-app-controls';

type ModuleName =
  TabViewsMetaSchema['workbenches'][0]['views'][0]['moduleName'];

const moduleNameToIcon = {
  all: <FolderIcon />,
  collection: <ViewLayersIcon />,
  doc: <PageIcon />,
  journal: <TodayIcon />,
  tag: <TagIcon />,
  trash: <DeleteIcon />,
} satisfies Record<ModuleName, ReactNode>;

const useTabViewsMeta = () => {
  const [tabViewsMeta, setTabViewsMeta] = useState<TabViewsMetaSchema>({
    workbenches: [],
  });

  useEffect(() => {
    apis?.ui.getTabViewsMeta().then(meta => {
      setTabViewsMeta(meta);
    });
    return events?.ui.onTabViewsMetaChanged(meta => {
      setTabViewsMeta(meta);
    });
  }, []);

  return tabViewsMeta;
};

const WorkbenchTab = ({
  workbench,
  active: tabActive,
  tabsLength,
}: {
  workbench: TabViewsMetaSchema['workbenches'][0];
  active: boolean;
  tabsLength: number;
}) => {
  const activeViewIndex = workbench.activeViewIndex ?? 0;
  return (
    <div
      role="button"
      key={workbench.key}
      data-active={tabActive}
      className={styles.tab}
    >
      {workbench.views.map((view, viewIdx) => {
        return (
          <Fragment key={view.id}>
            <button
              key={view.url}
              className={styles.splitViewLabel}
              data-active={activeViewIndex === viewIdx && tabActive}
              onContextMenu={() => {
                apis?.ui.showTabContextMenu(workbench.key, viewIdx);
              }}
              onClick={e => {
                e.stopPropagation();
                apis?.ui.showTab(workbench.key).then(() => {
                  apis?.ui.updateWorkbenchMeta(workbench.key, {
                    activeViewIndex: viewIdx,
                  });
                });
              }}
            >
              <div className={styles.labelIcon}>
                {moduleNameToIcon[view.moduleName]}
              </div>
              {workbench.pinned ? null : (
                <div className={styles.splitViewLabelText}>{view.title}</div>
              )}
            </button>

            {viewIdx !== workbench.views.length - 1 && (
              <div className={styles.splitViewSeparator} />
            )}
          </Fragment>
        );
      })}
      {!workbench.pinned && tabsLength > 1 ? (
        <IconButton
          size="small"
          type="plain"
          className={styles.controlIconButton}
          onClick={e => {
            e.stopPropagation();
            apis?.ui.closeTab(workbench.key);
          }}
        >
          <CloseIcon />
        </IconButton>
      ) : null}
    </div>
  );
};

export function ShellRoot() {
  const tabViewsMeta = useTabViewsMeta();
  const activeWorkbench = tabViewsMeta.workbenches.find(
    workbench => workbench.key === tabViewsMeta.activeWorkbenchKey
  );
  const activeView =
    activeWorkbench?.views[activeWorkbench.activeViewIndex ?? 0];

  const [pinned, unpinned] = partition(
    tabViewsMeta.workbenches,
    workbench => workbench.pinned
  );

  return (
    <div className={styles.root}>
      <div className={styles.tabs}>
        {pinned.map(workbench => {
          const tabActive = workbench.key === tabViewsMeta.activeWorkbenchKey;
          return (
            <WorkbenchTab
              tabsLength={pinned.length}
              key={workbench.key}
              workbench={workbench}
              active={tabActive}
            />
          );
        })}
        {pinned.length > 0 && unpinned.length > 0 && (
          <div className={styles.pinSeparator} />
        )}
        {unpinned.map(workbench => {
          const tabActive = workbench.key === tabViewsMeta.activeWorkbenchKey;
          return (
            <WorkbenchTab
              tabsLength={unpinned.length}
              key={workbench.key}
              workbench={workbench}
              active={tabActive}
            />
          );
        })}
        <div className={styles.divider} />
        <IconButton
          onClick={() => {
            activeView &&
              apis?.ui.addTab({
                views: [activeView],
              });
          }}
        >
          <PlusIcon />
        </IconButton>
      </div>
      <WindowsAppControls />
    </div>
  );
}
