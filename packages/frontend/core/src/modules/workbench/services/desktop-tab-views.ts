import { apis, appInfo, events } from '@affine/electron-api';
import { I18n, type I18nKeys, i18nTime } from '@affine/i18n';
import { Service, type TabViewsMetaSchema } from '@toeverything/infra';
import { combineLatest, debounceTime, map, switchMap } from 'rxjs';

import { resolveRouteLinkMeta } from '../../navigation';
import type { RouteModulePath } from '../../navigation/utils';
import type { WorkspacePropertiesAdapter } from '../../properties';
import type { WorkbenchService } from './workbench';

const routeModuleToI18n = {
  all: 'All pages',
  collection: 'Collections',
  tag: 'Tags',
  trash: 'Trash',
} satisfies Record<RouteModulePath, I18nKeys>;

type WorkbenchViewMeta =
  TabViewsMetaSchema['workbenches'][number]['views'][number];

/**
 * DesktopTabViewsService is responsible for syncing workbench views and active view index
 * TODO(@pengx17): use global state for syncing workbench views
 */
export class DesktopTabViewsService extends Service {
  constructor(
    public workbenchService: WorkbenchService,
    public workspaceProperties: WorkspacePropertiesAdapter
  ) {
    if (!environment.isDesktop) {
      throw new Error(
        'DesktopTabViews should only be used in desktop environment'
      );
    }
    super();

    this.setup();
  }

  get workbench() {
    return this.workbenchService.workbench;
  }

  setup = () => {
    this.recoverViews()
      .then(() => {
        // cleanup?
        this.coreToElectron();
        this.electronToCore();
      })
      .catch(err => {
        console.error(err);
      });
  };

  toFullUrl(location: { hash: string; pathname: string; search: string }) {
    return (
      window.origin +
      this.workbench.basename$.value +
      location.pathname +
      location.search +
      location.hash
    );
  }

  toViewLocation(input: string) {
    const url = new URL(input);
    return {
      hash: url.hash,
      pathname: url.pathname.split(this.workbench.basename$.value)[1],
      search: url.search,
    };
  }

  /**
   * @param location
   */
  toTabViewMeta(location: {
    id: string;
    hash: string;
    pathname: string;
    search: string;
  }): WorkbenchViewMeta | undefined {
    const url = this.toFullUrl(location);
    const linkMeta = resolveRouteLinkMeta(url);

    if (!linkMeta) {
      return;
    }
    const journalString =
      linkMeta.moduleName === 'doc'
        ? this.workspaceProperties.getJournalPageDateString(linkMeta.docId)
        : undefined;
    const isJournal = !!journalString;

    const title = (() => {
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
      id: location.id,
      url,
      title: title,
      moduleName: isJournal ? 'journal' : linkMeta.moduleName,
    };
  }

  // first view is loaded by default
  // recover workbench views > 0
  // todo(@pengx17): better way to recover views
  recoverViews = async () => {
    const meta = await apis?.ui.getTabViewsMeta();
    if (!meta) return;

    const workbench = meta.workbenches.find(
      workbench => workbench.key === appInfo?.tabViewKey
    );

    if (!workbench) return;

    workbench.views.forEach((view, index) => {
      if (index === 0) return;
      this.workbench.createView('beside', this.toViewLocation(view.url));
    });
    this.workbench.active(workbench.activeViewIndex ?? 0);

    // sync persisted ids -> core
    workbench.views.forEach((view, index) => {
      const viewEntity = this.workbench.viewAt(index);
      if (!viewEntity) return;
      viewEntity.id = view.id;
    });
  };

  // web core -> electron
  // sync workbench views and active view index to electron
  // electron will then broadcast to all views and update the tabs view
  coreToElectron = () => {
    const sub = combineLatest([
      this.workbench.views$.pipe(
        switchMap(views =>
          combineLatest(
            views.map(view =>
              view.location$.pipe(
                map(location => {
                  return {
                    id: view.id,
                    hash: location.hash,
                    pathname: location.pathname,
                    search: location.search,
                  };
                })
              )
            )
          )
        )
      ),
      this.workbench.activeViewIndex$,
    ])
      .pipe(debounceTime(50)) // avoid recursive update
      .subscribe(([viewLocations, activeViewIndex]) => {
        if (appInfo?.tabViewKey && apis) {
          apis.ui
            .updateWorkbenchMeta(appInfo.tabViewKey, {
              views: viewLocations
                .map(location => {
                  return this.toTabViewMeta(location);
                })
                .filter((v): v is NonNullable<typeof v> => !!v),
              activeViewIndex,
            })
            .catch(err => {
              console.error(err);
            });
        }
      });

    return sub.unsubscribe;
  };

  // electron active views -> web core
  electronToCore = () => {
    const disposables: (() => void)[] = [];
    // when active view index changes via tab view:

    if (events) {
      disposables.push(
        events.ui.onTabViewsMetaChanged(meta => {
          // we only care about the active view index
          const electronWorkbench = meta.workbenches.find(
            workbench => workbench.key === appInfo?.tabViewKey
          );
          if (!electronWorkbench) {
            return;
          }
          const activeViewIndex = electronWorkbench.activeViewIndex;
          if (
            activeViewIndex !== undefined &&
            activeViewIndex !== this.workbench.activeViewIndex$.value
          ) {
            this.workbench.active(activeViewIndex);
          }
        })
      );
      disposables.push(
        events.ui.onOpenInSplitView(({ tabKey }) => {
          if (tabKey === appInfo?.tabViewKey) {
            this.workbench.createView(
              'beside',
              this.workbench.activeView$.value.location$.value
            );
          }
        })
      );

      disposables.push(
        events.ui.onSeparateView(({ tabKey, viewIndex }) => {
          if (tabKey === appInfo?.tabViewKey) {
            const view = this.workbench.viewAt(viewIndex);
            if (view) {
              this.workbench.close(view);
            }
          }
        })
      );
    }

    return () => {
      disposables.forEach(dispose => dispose());
    };
  };
}
