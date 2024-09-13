import { apis, appInfo, events } from '@affine/electron-api';
import { LiveData, Service } from '@toeverything/infra';

import type { WorkbenchService } from '../../workbench';

/**
 * Synchronize workbench state with state stored in main process
 */
export class DesktopStateSynchronizer extends Service {
  constructor(private readonly workbenchService: WorkbenchService) {
    super();
    this.startSync();
  }

  startSync = () => {
    if (!BUILD_CONFIG.isElectron) {
      return;
    }

    const workbench = this.workbenchService.workbench;

    events?.ui.onTabAction(event => {
      if (
        event.type === 'open-in-split-view' &&
        event.payload.tabId === appInfo?.viewId
      ) {
        const to =
          event.payload.view?.path ??
          workbench.activeView$.value?.location$.value;

        workbench.open(to, {
          at: 'beside',
        });
      }

      if (
        event.type === 'separate-view' &&
        event.payload.tabId === appInfo?.viewId
      ) {
        const view = workbench.viewAt(event.payload.viewIndex);
        if (view) {
          workbench.close(view);
        }
      }

      if (
        event.type === 'activate-view' &&
        event.payload.tabId === appInfo?.viewId
      ) {
        workbench.active(event.payload.viewIndex);
      }
    });

    events?.ui.onToggleRightSidebar(tabId => {
      if (tabId === appInfo?.viewId) {
        workbench.sidebarOpen$.next(!workbench.sidebarOpen$.value);
      }
    });

    // sync workbench state with main process
    // also fill tab view meta with title & moduleName
    LiveData.computed(get => {
      return get(workbench.views$).map(view => {
        const location = get(view.location$);
        return {
          id: view.id,
          title: get(view.title$),
          iconName: get(view.icon$),
          path: {
            pathname: location.pathname,
            search: location.search,
            hash: location.hash,
          },
        };
      });
    }).subscribe(views => {
      if (!apis || !appInfo?.viewId) {
        return;
      }

      apis.ui
        .updateWorkbenchMeta(appInfo.viewId, {
          views,
        })
        .catch(console.error);
    });

    workbench.activeViewIndex$.subscribe(activeViewIndex => {
      if (!apis || !appInfo?.viewId) {
        return;
      }

      apis.ui
        .updateWorkbenchMeta(appInfo.viewId, {
          activeViewIndex: activeViewIndex,
        })
        .catch(console.error);
    });

    workbench.basename$.subscribe(basename => {
      if (!apis || !appInfo?.viewId) {
        return;
      }

      apis.ui
        .updateWorkbenchMeta(appInfo.viewId, {
          basename: basename,
        })
        .catch(console.error);
    });
  };
}
