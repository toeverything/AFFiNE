import {
  apis,
  appInfo,
  events,
  type WorkbenchViewMeta,
} from '@affine/electron-api';
import { I18n, type I18nKeys, i18nTime } from '@affine/i18n';
import type { DocsService } from '@toeverything/infra';
import { Service } from '@toeverything/infra';
import { combineLatest, filter, map, of, switchMap } from 'rxjs';

import { resolveRouteLinkMeta } from '../../navigation';
import type { RouteModulePath } from '../../navigation/utils';
import type { WorkspacePropertiesAdapter } from '../../properties';
import type { WorkbenchService } from '../../workbench';

const routeModuleToI18n = {
  all: 'All pages',
  collection: 'Collections',
  tag: 'Tags',
  trash: 'Trash',
} satisfies Record<RouteModulePath, I18nKeys>;

/**
 * Synchronize workbench state with state stored in main process
 */
export class DesktopStateSynchronizer extends Service {
  constructor(
    private readonly workbenchService: WorkbenchService,
    private readonly workspaceProperties: WorkspacePropertiesAdapter,
    private readonly docsService: DocsService
  ) {
    super();
    this.startSync();
  }

  startSync = () => {
    if (!environment.isDesktop) {
      return;
    }

    const workbench = this.workbenchService.workbench;

    events?.ui.onTabAction(event => {
      if (
        event.type === 'open-in-split-view' &&
        event.payload.tabId === appInfo?.viewId
      ) {
        const activeView = workbench.activeView$.value;
        if (activeView) {
          workbench.open(activeView.location$.value, {
            at: 'beside',
          });
        }
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
    this.workspaceProperties.workspace.engine.rootDocState$
      .pipe(
        filter(v => v.ready),
        switchMap(() => workbench.views$),
        switchMap(views => {
          return combineLatest(
            views.map(view =>
              view.location$.map(location => {
                return {
                  view,
                  location,
                };
              })
            )
          );
        }),
        map(viewLocations => {
          if (!apis || !appInfo?.viewId) {
            return;
          }

          const viewMetas = viewLocations.map(({ view, location }) => {
            return {
              id: view.id,
              path: location,
            };
          });

          return viewMetas.map(viewMeta => this.fillTabViewMeta(viewMeta));
        }),
        filter(v => !!v),
        switchMap(viewMetas => {
          return this.docsService.list.docs$.pipe(
            switchMap(docs => {
              return combineLatest(
                viewMetas.map(vm => {
                  return (
                    docs
                      .find(doc => doc.id === vm.docId)
                      ?.mode$.asObservable() ?? of('page')
                  ).pipe(
                    map(mode => ({
                      ...vm,
                      moduleName:
                        vm.moduleName === 'page' ? mode : vm.moduleName,
                    }))
                  );
                })
              );
            })
          );
        })
      )
      .subscribe(viewMetas => {
        if (!apis || !appInfo?.viewId) {
          return;
        }

        apis.ui
          .updateWorkbenchMeta(appInfo.viewId, {
            views: viewMetas,
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

  private toFullUrl(
    basename: string,
    location: { hash?: string; pathname?: string; search?: string }
  ) {
    return basename + location.pathname + location.search + location.hash;
  }

  // fill tab view meta with title & moduleName
  private fillTabViewMeta(
    view: WorkbenchViewMeta
  ): WorkbenchViewMeta & { docId?: string } {
    if (!view.path) {
      return view;
    }

    const url = this.toFullUrl(
      this.workbenchService.workbench.basename$.value,
      view.path
    );
    const linkMeta = resolveRouteLinkMeta(url);

    if (!linkMeta) {
      return view;
    }

    const journalString =
      linkMeta.moduleName === 'doc'
        ? this.workspaceProperties.getJournalPageDateString(linkMeta.docId)
        : undefined;
    const isJournal = !!journalString;

    const title = (() => {
      // todo: resolve more module types like collections?
      if (linkMeta?.moduleName === 'doc') {
        if (journalString) {
          return i18nTime(journalString, { absolute: { accuracy: 'day' } });
        }
        return (
          this.workspaceProperties.workspace.docCollection.meta.getDocMeta(
            linkMeta.docId
          )?.title || I18n['Untitled']()
        );
      } else {
        return I18n[routeModuleToI18n[linkMeta.moduleName]]();
      }
    })();

    return {
      ...view,
      title: title,
      docId: linkMeta.docId,
      moduleName: isJournal ? 'journal' : linkMeta.moduleName,
    };
  }
}
