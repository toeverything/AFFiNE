import { LiveData, Service } from '@toeverything/infra';

import type { DesktopApiService } from '../../desktop-api';
import type { PeekViewService } from '../../peek-view';
import type { WorkbenchService } from '../../workbench';

/**
 * Synchronize workbench state with state stored in main process
 */
export class DesktopStateSynchronizer extends Service {
  constructor(
    private readonly workbenchService: WorkbenchService,
    private readonly electronApi: DesktopApiService,
    private readonly peekViewService: PeekViewService
  ) {
    super();
    this.startSync();
  }

  startSync = () => {
    if (!BUILD_CONFIG.isElectron) {
      return;
    }

    const workbench = this.workbenchService.workbench;
    const appInfo = this.electronApi.appInfo;

    this.disposables.push(
      this.electronApi.events.ui.onTabAction(event => {
        if (
          event.type === 'open-in-split-view' &&
          event.payload.tabId === appInfo?.viewId
        ) {
          workbench.openAll({
            at: 'beside',
            show: false,
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
      })
    );

    this.disposables.push(
      this.electronApi.events.ui.onCloseView(() => {
        (async () => {
          if (await this.electronApi.handler.ui.isActiveTab()) {
            // close current view. stop if any one is successful
            // 1. peek view
            // 2. split view
            // 3. tab
            // 4. otherwise, hide the window
            if (this.peekViewService.peekView.show$.value?.value) {
              this.peekViewService.peekView.close();
            } else if (workbench.views$.value.length > 1) {
              workbench.close(workbench.activeView$.value);
            } else {
              const tabs = await this.electronApi.handler.ui.getTabsStatus();
              if (tabs.length > 1) {
                await this.electronApi.handler.ui.closeTab();
              } else {
                await this.electronApi.handler.ui.handleHideApp();
              }
            }
          }
        })().catch(console.error);
      })
    );

    this.disposables.push(
      this.electronApi.events.ui.onToggleRightSidebar(tabId => {
        if (tabId === appInfo?.viewId) {
          workbench.setSidebarOpen(!workbench.sidebarOpen$.value);
        }
      })
    );

    this.disposables.push(
      this.electronApi.events.ui.onTabGoToRequest(opts => {
        if (opts.tabId === appInfo?.viewId) {
          this.workbenchService.workbench.open(opts.to);
        }
      })
    );

    // sync workbench state with main process
    // also fill tab view meta with title & moduleName
    const viewsSub = LiveData.computed(get => {
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
      if (!appInfo?.viewId) {
        return;
      }

      this.electronApi.handler.ui
        .updateWorkbenchMeta(appInfo.viewId, {
          views,
        })
        .catch(console.error);
    });

    const activeViewIndexSub = workbench.activeViewIndex$.subscribe(
      activeViewIndex => {
        if (!appInfo?.viewId) {
          return;
        }

        this.electronApi.handler.ui
          .updateWorkbenchMeta(appInfo.viewId, {
            activeViewIndex: activeViewIndex,
          })
          .catch(console.error);
      }
    );

    const basenameSub = workbench.basename$.subscribe(basename => {
      if (!appInfo?.viewId) {
        return;
      }

      this.electronApi.handler.ui
        .updateWorkbenchMeta(appInfo.viewId, {
          basename: basename,
        })
        .catch(console.error);
    });

    this.disposables.push(
      () => viewsSub.unsubscribe(),
      () => activeViewIndexSub.unsubscribe(),
      () => basenameSub.unsubscribe()
    );
  };
}
