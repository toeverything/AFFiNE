import { join } from 'node:path';

import { Injectable, Logger } from '@nestjs/common';
import {
  app,
  Menu,
  MenuItem,
  type View,
  type WebContents,
  WebContentsView,
} from 'electron';
import { partition } from 'lodash-es';
import { nanoid } from 'nanoid';
import {
  BehaviorSubject,
  combineLatest,
  filter,
  firstValueFrom,
  map,
  shareReplay,
  startWith,
  Subject,
  type Unsubscribable,
} from 'rxjs';

import { getIpcEvent, IpcEvent, IpcHandle, IpcScope } from '../../../ipc';
import {
  SpellCheckStateKey,
  SpellCheckStateSchema,
  type TabViewsMetaSchema,
  type WorkbenchMeta,
  type WorkbenchViewMeta,
} from '../../../shared/shared-state-schema';
import { beforeAppQuit, onTabClose } from '../cleanup';
import { mainWindowOrigin, shellViewUrl } from '../constants';
import { HelperProcessManager } from '../helper-process';
import { GlobalStateStorage } from '../storage';
import { isMacOS } from '../utils';
import { MainWindowManager } from './main-window.service';
import { TabViewsState } from './states';

export type AddTabAction = {
  type: 'add-tab';
  payload: WorkbenchMeta;
};

export type CloseTabAction = {
  type: 'close-tab';
  payload?: string;
};

export type PinTabAction = {
  type: 'pin-tab';
  payload: { key: string; shouldPin: boolean };
};

export type ActivateViewAction = {
  type: 'activate-view';
  payload: { tabId: string; viewIndex: number };
};

export type SeparateViewAction = {
  type: 'separate-view';
  payload: { tabId: string; viewIndex: number };
};

export type OpenInSplitViewAction = {
  type: 'open-in-split-view';
  payload: {
    tabId: string;
    view?: Omit<WorkbenchViewMeta, 'id'>;
  };
};

export type TabAction =
  | AddTabAction
  | CloseTabAction
  | PinTabAction
  | ActivateViewAction
  | SeparateViewAction
  | OpenInSplitViewAction;

export type AddTabOption = {
  basename?: string;
  view?: Omit<WorkbenchViewMeta, 'id'> | Array<Omit<WorkbenchViewMeta, 'id'>>;
  target?: string;
  edge?: 'left' | 'right';
  /**
   * Whether to show the tab after adding.
   */
  show?: boolean;
  pinned?: boolean;
};

@Injectable()
export class TabViewsManager {
  constructor(
    private readonly mainWindowManager: MainWindowManager,
    public readonly tabViewsState: TabViewsState,
    private readonly helperProcessManager: HelperProcessManager,
    private readonly globalStateStorage: GlobalStateStorage,
    private readonly logger: Logger
  ) {
    this.setup();
  }

  @IpcEvent({ scope: IpcScope.UI, name: 'tabViewsMetaChange' })
  private readonly tabViewsMeta$ = this.tabViewsState.$;

  readonly appTabsUIReady$ = new BehaviorSubject(new Set<string>());

  get appTabsUIReady() {
    return this.appTabsUIReady$.value;
  }

  // all web views
  readonly webViewsMap$ = new BehaviorSubject(
    new Map<string, WebContentsView>()
  );

  @IpcEvent({ scope: IpcScope.UI, name: 'tabsStatusChange' })
  readonly tabsStatus$ = combineLatest([
    this.tabViewsMeta$.pipe(startWith(this.tabViewsState.value)),
    this.webViewsMap$,
    this.appTabsUIReady$,
  ]).pipe(
    map(([viewsMeta, webContents, ready]) => {
      return viewsMeta.workbenches.map(w => {
        return {
          id: w.id,
          pinned: !!w.pinned,
          active: viewsMeta.activeWorkbenchId === w.id,
          loaded: webContents.has(w.id),
          ready: ready.has(w.id),
          activeViewIndex: w.activeViewIndex,
          views: w.views,
          basename: w.basename,
        };
      });
    }),
    shareReplay(1)
  );

  @IpcEvent({ scope: IpcScope.UI })
  closeView$ = new Subject<void>();

  // all app views (excluding shell view)
  readonly workbenchViewsMap$ = this.webViewsMap$.pipe(
    map(
      views => new Map([...views.entries()].filter(([key]) => key !== 'shell'))
    )
  );

  // a stack of closed workbenches (for undo close tab)
  readonly closedWorkbenches: WorkbenchMeta[] = [];

  /**
   * Emits whenever a tab action is triggered.
   */
  @IpcEvent({ scope: IpcScope.UI })
  readonly tabAction$ = new Subject<TabAction>();

  cookies: Electron.Cookie[] = [];

  @IpcEvent({ scope: IpcScope.UI, name: 'activeTabChanged' })
  readonly activeWorkbenchId$ = this.tabViewsMeta$.pipe(
    map(m => m?.activeWorkbenchId ?? m?.workbenches[0].id)
  );

  readonly activeWorkbench$ = combineLatest([
    this.activeWorkbenchId$,
    this.workbenchViewsMap$,
  ]).pipe(map(([key, views]) => (key ? views.get(key) : undefined)));

  readonly shellView$ = this.webViewsMap$.pipe(
    map(views => views.get('shell'))
  );

  readonly webViewKeys$ = this.webViewsMap$.pipe(
    map(views => Array.from(views.keys()))
  );

  get tabViewsMeta() {
    return this.tabViewsState.value;
  }

  private set tabViewsMeta(meta: TabViewsMetaSchema) {
    this.tabViewsState.value = meta;
  }

  readonly patchTabViewsMeta = (patch: Partial<TabViewsMetaSchema>) => {
    this.tabViewsState.patch(patch);
  };

  get shellView() {
    return this.webViewsMap$.value.get('shell');
  }

  set activeWorkbenchId(id: string | undefined) {
    this.patchTabViewsMeta({
      activeWorkbenchId: id,
    });
  }

  get activeWorkbenchId() {
    return (
      this.tabViewsMeta.activeWorkbenchId ??
      this.tabViewsMeta.workbenches.at(0)?.id
    );
  }

  get activeWorkbenchIndex() {
    return this.tabViewsMeta.workbenches.findIndex(
      w => w.id === this.activeWorkbenchId
    );
  }

  get activeWorkbenchView() {
    return this.activeWorkbenchId
      ? this.webViewsMap$.value.get(this.activeWorkbenchId)
      : undefined;
  }

  get activeWorkbenchMeta() {
    return this.tabViewsMeta.workbenches.find(
      w => w.id === this.activeWorkbenchId
    );
  }

  get mainWindow() {
    return this.mainWindowManager.mainWindow;
  }

  get tabViewsMap() {
    return this.webViewsMap$.value;
  }

  get allViews() {
    return Array.from(this.tabViewsMap.values());
  }

  setTabUIReady = (tabId: string) => {
    this.appTabsUIReady$.next(new Set([...this.appTabsUIReady, tabId]));
    this.reorderViews();
    const view = this.tabViewsMap.get(tabId);
    if (view) {
      this.resizeView(view);
    }
  };

  setTabUIUnready = (tabId: string) => {
    this.appTabsUIReady$.next(
      new Set([...this.appTabsUIReady$.value].filter(key => key !== tabId))
    );
    this.reorderViews();
  };

  getWorkbenchIdFromWebContentsId = (id: number) => {
    return Array.from(this.tabViewsMap.entries()).find(
      ([, view]) => view.webContents.id === id
    )?.[0];
  };

  updateWorkbenchMeta = (id: string, patch: Partial<WorkbenchMeta>) => {
    const workbenches = this.tabViewsMeta.workbenches;
    const index = workbenches.findIndex(w => w.id === id);
    if (index === -1) {
      return;
    }
    const workbench = workbenches[index];
    const newWorkbenches = workbenches.toSpliced(index, 1, {
      ...workbench,
      ...patch,
      views: patch.views
        ? patch.views.map(v => {
            const existing = workbench.views.find(e => e.id === v.id);
            return {
              ...existing,
              ...v,
            };
          })
        : workbench.views,
    });
    this.patchTabViewsMeta({
      workbenches: newWorkbenches,
    });
  };

  updateWorkbenchViewMeta = (
    workbenchId: string,
    viewId: string | number,
    patch: Partial<WorkbenchViewMeta>
  ) => {
    const workbench = this.tabViewsMeta.workbenches.find(
      w => w.id === workbenchId
    );
    if (!workbench) {
      return;
    }
    const views = workbench.views;
    const viewIndex =
      typeof viewId === 'string'
        ? views.findIndex(v => v.id === viewId)
        : viewId;
    if (viewIndex === -1) {
      return;
    }
    const newViews = views.toSpliced(viewIndex, 1, {
      ...views[viewIndex],
      ...patch,
    });
    this.updateWorkbenchMeta(workbenchId, {
      views: newViews,
    });
  };

  isActiveTab = (id: string) => {
    return this.activeWorkbenchId === id;
  };

  closeTab = async (id?: string) => {
    if (!id && !this.activeWorkbenchMeta?.pinned) {
      id = this.activeWorkbenchId;
    }

    if (!id) {
      return;
    }

    const index = this.tabViewsMeta.workbenches.findIndex(w => w.id === id);
    if (index === -1 || this.tabViewsMeta.workbenches.length === 1) {
      return;
    }
    const targetWorkbench = this.tabViewsMeta.workbenches[index];
    const workbenches = this.tabViewsMeta.workbenches.toSpliced(index, 1);
    // if the active view is closed, switch to the next view (index unchanged)
    // if the new index is out of bound, switch to the last view
    let activeWorkbenchKey = this.activeWorkbenchId;

    if (id === activeWorkbenchKey) {
      activeWorkbenchKey = workbenches[index]?.id ?? workbenches.at(-1)?.id;
    }

    if (!activeWorkbenchKey) {
      return;
    }

    this.showTab(activeWorkbenchKey).catch(error => this.logger.error(error));

    this.patchTabViewsMeta({
      workbenches,
      activeWorkbenchId: activeWorkbenchKey,
    });

    this.tabAction$.next({
      type: 'close-tab',
      payload: id,
    });

    this.closedWorkbenches.push(targetWorkbench);

    setTimeout(() => {
      const view = this.tabViewsMap.get(id);
      this.tabViewsMap.delete(id);

      if (this.mainWindow && view) {
        this.mainWindow.contentView.removeChildView(view);
        view?.webContents.close({
          waitForBeforeUnload: true,
        });
      }
    }, 500); // delay a bit to get rid of the flicker

    onTabClose(id);
  };

  undoCloseTab = async () => {
    if (this.closedWorkbenches.length === 0) {
      return;
    }

    const workbench = this.closedWorkbenches.pop();

    if (workbench) {
      await this.addTab({
        basename: workbench.basename,
        view: workbench.views,
      });
    }
  };

  addTab = async (option: AddTabOption = {}) => {
    const activeWorkbench = this.activeWorkbenchMeta;

    option.basename ??= activeWorkbench?.basename ?? '/';
    option.view ??= {
      title: 'New Tab',
      path: option.basename?.startsWith('/workspace')
        ? {
            pathname: '/all',
          }
        : undefined,
    };
    option.pinned ??= false;

    const workbenches = this.tabViewsMeta.workbenches;
    const newKey = this.generateViewId('app');
    const views = (
      Array.isArray(option.view) ? option.view : [option.view]
    ).map(v => {
      return {
        ...v,
        id: nanoid(),
      };
    });

    const targetItem =
      workbenches.find(w => w.id === option.target) ?? workbenches.at(-1);

    const newIndex =
      (targetItem ? workbenches.indexOf(targetItem) : workbenches.length) +
      (option.edge === 'left' ? 0 : 1);

    const workbench: WorkbenchMeta = {
      basename: option.basename,
      activeViewIndex: 0,
      views: views,
      id: newKey,
      pinned: option.pinned,
    };

    this.patchTabViewsMeta({
      workbenches: workbenches.toSpliced(newIndex, 0, workbench),
      activeWorkbenchId: this.activeWorkbenchId ?? newKey,
    });
    await (option.show !== false ? this.showTab(newKey) : this.loadTab(newKey));
    this.tabAction$.next({
      type: 'add-tab',
      payload: workbench,
    });
    return workbench;
  };

  // parse the full pathname to basename and pathname
  // eg: /workspace/xxx/yyy => { basename: '/workspace/xxx', pathname: '/yyy' }
  parseFullPathname = (url: string) => {
    const urlObj = new URL(url);
    const basename = urlObj.pathname.match(/\/workspace\/[^/]+/g)?.[0] ?? '/';
    return {
      basename,
      pathname: urlObj.pathname.slice(basename.length),
      search: urlObj.search,
      hash: urlObj.hash,
    };
  };

  addTabWithUrl = async (url: string) => {
    const { basename, pathname, search, hash } = this.parseFullPathname(url);

    return this.addTab({
      basename,
      view: {
        path: { pathname, search, hash },
      },
    });
  };

  loadTab = async (id: string): Promise<WebContentsView | undefined> => {
    if (!this.tabViewsMeta.workbenches.some(w => w.id === id)) {
      return;
    }

    let view = this.tabViewsMap.get(id);
    if (!view) {
      view = await this.createAndAddView('app', id);
    }
    const workbench = this.tabViewsMeta.workbenches.find(w => w.id === id);
    const viewMeta = workbench?.views[workbench.activeViewIndex];
    if (workbench && viewMeta) {
      const url = new URL(
        workbench.basename + (viewMeta.path?.pathname ?? ''),
        mainWindowOrigin
      );
      url.hash = viewMeta.path?.hash ?? '';
      url.search = viewMeta.path?.search ?? '';
      this.logger.log(`loading tab ${id} at ${url.href}`);
      const start = performance.now();
      view.webContents
        .loadURL(url.href)
        .then(() => {
          this.logger.log(
            `loading tab ${id} at ${url.href} took ${performance.now() - start}ms`
          );
        })
        .catch(err => this.logger.error(err));
    }
    return view;
  };

  showTab = async (id: string): Promise<WebContentsView | undefined> => {
    if (this.activeWorkbenchId !== id) {
      this.patchTabViewsMeta({
        activeWorkbenchId: id,
      });
    }
    this.reorderViews();
    let view = this.tabViewsMap.get(id);
    if (!view) {
      view = await this.loadTab(id);
    }
    this.reorderViews();
    if (view) {
      this.resizeView(view);
    }
    return view;
  };

  pinTab = (key: string, shouldPin: boolean) => {
    // move the pinned tab to the last index of the pinned tabs
    const [pinned, unPinned] = partition(
      this.tabViewsMeta.workbenches,
      w => w.pinned
    );

    const workbench = this.tabViewsMeta.workbenches.find(w => w.id === key);
    if (!workbench) {
      return;
    }

    this.tabAction$.next({
      type: 'pin-tab',
      payload: { key, shouldPin },
    });

    if (workbench.pinned && !shouldPin) {
      this.patchTabViewsMeta({
        workbenches: [
          ...pinned.filter(w => w.id !== key),
          { ...workbench, pinned: false },
          ...unPinned,
        ],
      });
    } else if (!workbench.pinned && shouldPin) {
      this.patchTabViewsMeta({
        workbenches: [
          ...pinned,
          { ...workbench, pinned: true },
          ...unPinned.filter(w => w.id !== key),
        ],
      });
    }
  };

  activateView = async (tabId: string, viewIndex: number) => {
    this.tabAction$.next({
      type: 'activate-view',
      payload: { tabId, viewIndex },
    });
    this.updateWorkbenchMeta(tabId, {
      activeViewIndex: viewIndex,
    });
    await this.showTab(tabId);
  };

  moveTab = (from: string, to: string, edge?: 'left' | 'right') => {
    const workbenches = this.tabViewsMeta.workbenches;
    let fromItem = workbenches.find(w => w.id === from);
    const toItem = workbenches.find(w => w.id === to);
    if (!fromItem || !toItem) {
      return;
    }

    const fromIndex = workbenches.indexOf(fromItem);

    fromItem = {
      ...fromItem,
      pinned: toItem.pinned,
    };

    let workbenchesAfterMove = workbenches.toSpliced(fromIndex, 1);
    const toIndex = workbenchesAfterMove.indexOf(toItem);
    if (edge === 'left') {
      workbenchesAfterMove = workbenchesAfterMove.toSpliced(
        toIndex,
        0,
        fromItem
      );
    } else {
      workbenchesAfterMove = workbenchesAfterMove.toSpliced(
        toIndex + 1,
        0,
        fromItem
      );
    }

    this.patchTabViewsMeta({
      workbenches: workbenchesAfterMove,
    });
  };

  separateView = (tabId: string, viewIndex: number) => {
    const tabMeta = this.tabViewsMeta.workbenches.find(w => w.id === tabId);
    if (!tabMeta) {
      return;
    }
    this.tabAction$.next({
      type: 'separate-view',
      payload: { tabId, viewIndex },
    });
    const newTabMeta: WorkbenchMeta = {
      ...tabMeta,
      activeViewIndex: 0,
      views: [tabMeta.views[viewIndex]],
    };
    this.updateWorkbenchMeta(tabId, {
      views: tabMeta.views.toSpliced(viewIndex, 1),
    });
    this.addTab(newTabMeta).catch(err => this.logger.error(err));
  };

  openInSplitView = (payload: OpenInSplitViewAction['payload']) => {
    const tabMeta = this.tabViewsMeta.workbenches.find(
      w => w.id === payload.tabId
    );
    if (!tabMeta) {
      return;
    }
    this.tabAction$.next({
      type: 'open-in-split-view',
      payload: payload,
    });
  };

  reorderViews = () => {
    if (this.mainWindow) {
      // if tab ui of the current active view is not ready,
      // make sure shell view is on top
      const activeView = this.activeWorkbenchView;

      const getViewId = (view: View) => {
        return [...this.tabViewsMap.entries()].find(
          ([_, v]) => v === view
        )?.[0];
      };

      const isViewReady = (view: View) => {
        if (view === this.shellView) {
          return true;
        }
        const id = getViewId(view);
        return id ? this.appTabsUIReady.has(id) : false;
      };

      // 2: active view (ready)
      // 1: shell
      // 0: inactive view (ready)
      // -1 inactive view (not ready)
      // -1 active view (not ready)
      const getScore = (view: View) => {
        if (view === this.shellView) {
          return 1;
        }
        const viewReady = isViewReady(view);
        if (view === activeView) {
          return viewReady ? 2 : -1;
        } else {
          return viewReady ? 0 : -1;
        }
      };

      const sorted = [...this.tabViewsMap.entries()]
        .map(([id, view]) => {
          return {
            id,
            view,
            score: getScore(view),
          };
        })
        .filter(({ score }) => score >= 0)
        .toSorted((a, b) => a.score - b.score);

      // remove inactive views
      this.mainWindow?.contentView.children.forEach(view => {
        if (!isViewReady(view)) {
          this.mainWindow?.contentView.removeChildView(view);
        }
      });

      sorted.forEach(({ view }, idx) => {
        this.mainWindow?.contentView.addChildView(view, idx);
      });

      this.handleWebContentsResize(activeView?.webContents).catch(err =>
        this.logger.error(err)
      );
    }
  };

  handleWebContentsResize = async (webContents?: WebContents) => {
    // right now when window is resized, we will relocate the traffic light positions
    if (isMacOS()) {
      const window = await this.mainWindowManager.ensureMainWindow();
      const factor = webContents?.getZoomFactor() || 1;
      window?.setWindowButtonPosition({ x: 14 * factor, y: 14 * factor - 2 });
    }
  };

  @IpcHandle({ scope: IpcScope.UI })
  handleWindowResize = async () => {
    const e = getIpcEvent();
    await this.handleWebContentsResize(e.sender);
  };

  setup = () => {
    const windowReadyToShow$ = this.mainWindowManager.mainWindow$.pipe(
      filter(w => !!w)
    );

    const disposables: Unsubscribable[] = [];
    disposables.push(
      windowReadyToShow$.subscribe(w => {
        this.handleWebContentsResize().catch(err => this.logger.error(err));
        const screenSizeChangeEvents = ['resize', 'maximize', 'unmaximize'];
        const onResize = () => {
          if (this.activeWorkbenchView) {
            this.resizeView(this.activeWorkbenchView);
          }
          if (this.shellView) {
            this.resizeView(this.shellView);
          }
        };
        screenSizeChangeEvents.forEach(event => {
          w.on(event as any, () => {
            onResize();
            // sometimes the resize event is too fast, the view is not ready for the new size (esp. on linux)
            setTimeout(() => {
              onResize();
            }, 100);
          });
        });

        // add shell view
        this.createAndAddView('shell').catch(err => this.logger.error(err));
        (async () => {
          if (this.tabViewsMeta.workbenches.length === 0) {
            // create a default view (e.g., on first launch)
            await this.addTab();
          } else {
            const defaultTabId = this.activeWorkbenchId;
            if (defaultTabId) await this.showTab(defaultTabId);
          }
        })().catch(err => this.logger.error(err));
      })
    );

    disposables.forEach(d => {
      beforeAppQuit(() => {
        d.unsubscribe();
      });
    });

    const focusActiveView = () => {
      if (
        !this.activeWorkbenchView ||
        this.activeWorkbenchView.webContents.isFocused() ||
        this.activeWorkbenchView.webContents.isDevToolsFocused()
      ) {
        return;
      }
      this.activeWorkbenchView?.webContents.focus();
      setTimeout(() => {
        focusActiveView();
      }, 100);
    };

    this.mainWindow?.on('focus', () => {
      focusActiveView();
    });

    combineLatest([
      this.activeWorkbenchId$,
      this.mainWindowManager.mainWindow$,
    ]).subscribe(([_, window]) => {
      // makes sure the active view is always focused
      if (window?.isFocused()) {
        focusActiveView();
      }
    });
  };

  getViewById = (id: string) => {
    if (id === 'shell') {
      return this.shellView;
    } else {
      return this.tabViewsMap.get(id);
    }
  };

  resizeView = (view: View) => {
    // app view will take full w/h of the main window
    view.setBounds({
      x: 0,
      y: 0,
      width: this.mainWindow?.getContentBounds().width ?? 0,
      height: this.mainWindow?.getContentBounds().height ?? 0,
    });
  };

  private readonly generateViewId = (type: 'app' | 'shell') => {
    return type === 'shell' ? 'shell' : `app-${nanoid()}`;
  };

  private readonly createAndAddView = async (
    type: 'app' | 'shell',
    viewId = this.generateViewId(type)
  ) => {
    if (this.shellView && type === 'shell') {
      this.logger.error('shell view is already created');
    }

    const start = performance.now();
    const additionalArguments = [`--window-name=main`, `--view-id=${viewId}`];
    await this.helperProcessManager.ensureHelperProcess();

    const spellCheckSettings = SpellCheckStateSchema.parse(
      this.globalStateStorage.get(SpellCheckStateKey) ?? {}
    );

    const view = new WebContentsView({
      webPreferences: {
        webgl: true,
        transparent: true,
        contextIsolation: true,
        sandbox: false,
        spellcheck: spellCheckSettings.enabled,
        preload: join(__dirname, './preload.js'), // this points to the bundled preload module
        // serialize exposed meta that to be used in preload
        additionalArguments: additionalArguments,
      },
    });

    if (spellCheckSettings.enabled) {
      view.webContents.on('context-menu', (_event, params) => {
        const shouldShow =
          params.misspelledWord && params.dictionarySuggestions.length > 0;

        if (!shouldShow) {
          return;
        }
        const menu = new Menu();

        // Add each spelling suggestion
        for (const suggestion of params.dictionarySuggestions) {
          menu.append(
            new MenuItem({
              label: suggestion,
              click: () => view.webContents.replaceMisspelling(suggestion),
            })
          );
        }

        // Allow users to add the misspelled word to the dictionary
        if (params.misspelledWord) {
          menu.append(
            new MenuItem({
              label: 'Add to dictionary', // TODO: i18n
              click: () =>
                view.webContents.session.addWordToSpellCheckerDictionary(
                  params.misspelledWord
                ),
            })
          );
        }

        menu.popup();
      });
    }

    this.webViewsMap$.next(this.tabViewsMap.set(viewId, view));
    let unsub = () => {};

    // shell process do not need to connect to helper process
    if (type !== 'shell') {
      view.webContents.on('did-finish-load', () => {
        unsub = this.helperProcessManager.connectRenderer(view.webContents);
      });
    } else {
      view.webContents.on('focus', () => {
        globalThis.setTimeout(() => {
          // when shell is focused, focus the active app view instead (to make sure global keybindings work)
          this.activeWorkbenchView?.webContents.focus();
        });
      });

      view.webContents
        .loadURL(shellViewUrl)
        .catch(err => this.logger.error(err));
    }

    view.webContents.on('destroyed', () => {
      unsub();
      this.webViewsMap$.next(
        new Map(
          [...this.tabViewsMap.entries()].filter(([key]) => key !== viewId)
        )
      );
      // if all views are destroyed, close the app
      // should only happen in tests
      if (this.tabViewsMap.size === 0) {
        app.quit();
      }
    });

    this.resizeView(view);

    view.webContents.on('did-finish-load', () => {
      this.resizeView(view);
      if (process.env.SKIP_ONBOARDING) {
        this.skipOnboarding(view).catch(err => this.logger.error(err));
      }
    });

    // reorder will add to main window when loaded
    this.reorderViews();

    this.logger.log(`view ${viewId} created in ${performance.now() - start}ms`);
    return view;
  };

  switchTab = (n: number) => {
    const item = this.tabViewsMeta.workbenches.at(n === 9 ? -1 : n - 1);
    if (item) {
      this.showTab(item.id).catch(err => this.logger.error(err));
    }
  };

  switchToNextTab = () => {
    const length = this.tabViewsMeta.workbenches.length;
    const activeIndex = this.activeWorkbenchIndex;
    const item = this.tabViewsMeta.workbenches.at(
      activeIndex === length - 1 ? 0 : activeIndex + 1
    );
    if (item) {
      this.showTab(item.id).catch(err => this.logger.error(err));
    }
  };

  switchToPreviousTab = () => {
    const length = this.tabViewsMeta.workbenches.length;
    const activeIndex = this.activeWorkbenchIndex;
    const item = this.tabViewsMeta.workbenches.at(
      activeIndex === 0 ? length - 1 : activeIndex - 1
    );
    if (item) {
      this.showTab(item.id).catch(err => this.logger.error(err));
    }
  };

  showTabContextMenu = async (
    tabId: string,
    viewIndex: number
  ): Promise<TabAction | null> => {
    const workbenches = this.tabViewsMeta.workbenches;
    const tabMeta = workbenches.find(w => w.id === tabId);
    if (!tabMeta) {
      return null;
    }

    const { resolve, promise } = Promise.withResolvers<TabAction | null>();

    const template: Parameters<typeof Menu.buildFromTemplate>[0] = [
      tabMeta.pinned
        ? {
            label: 'Unpin tab',
            click: () => {
              this.pinTab(tabId, false);
            },
          }
        : {
            label: 'Pin tab',
            click: () => {
              this.pinTab(tabId, true);
            },
          },
      {
        label: 'Refresh tab',
        click: () => {
          if (this.activeWorkbenchId) {
            this.loadTab(this.activeWorkbenchId).catch(err =>
              this.logger.error(err)
            );
          }
        },
      },
      {
        label: 'Duplicate tab',
        click: () => {
          this.addTab({
            basename: tabMeta.basename,
            view: tabMeta.views,
            show: false,
          }).catch(err => this.logger.error(err));
        },
      },

      { type: 'separator' },

      tabMeta.views.length > 1
        ? {
            label: 'Separate tabs',
            click: () => {
              this.separateView(tabId, viewIndex);
            },
          }
        : {
            label: 'Open in split view',
            click: () => {
              this.openInSplitView({ tabId });
            },
          },

      ...(workbenches.length > 1
        ? ([
            { type: 'separator' },
            {
              label: 'Close tab',
              click: () => {
                this.closeTab(tabId).catch(err => this.logger.error(err));
              },
            },
            {
              label: 'Close other tabs',
              click: () => {
                const tabsToRetain = this.tabViewsMeta.workbenches.filter(
                  w => w.id === tabId || w.pinned
                );

                this.patchTabViewsMeta({
                  workbenches: tabsToRetain,
                  activeWorkbenchId: tabId,
                });
              },
            },
          ] as const)
        : []),
    ];
    const menu = Menu.buildFromTemplate(template);
    menu.popup();
    let unsub: (() => void) | undefined;
    const subscription = this.tabAction$.subscribe(action => {
      resolve(action);
      unsub?.();
    });
    menu.on('menu-will-close', () => {
      setTimeout(() => {
        resolve(null);
        unsub?.();
      });
    });
    unsub = () => {
      subscription.unsubscribe();
    };
    return promise;
  };

  private async skipOnboarding(view: WebContentsView) {
    await view.webContents.executeJavaScript(`
    window.localStorage.setItem('app_config', '{"onBoarding":false}');
    window.localStorage.setItem('dismissAiOnboarding', 'true');
    window.localStorage.setItem('dismissAiOnboardingEdgeless', 'true');
    window.localStorage.setItem('dismissAiOnboardingLocal', 'true');
    `);
  }
}

/**
 * For separation of concerns, we put the ipc communication related logic here.
 */
@Injectable()
export class TabViewsIpcRegistry {
  @IpcEvent({ scope: IpcScope.UI })
  toggleRightSidebar$ = new Subject<string>();

  @IpcEvent({ scope: IpcScope.UI })
  tabShellViewActiveChange$ = combineLatest([
    this.tabViewsService.appTabsUIReady$,
    this.tabViewsService.activeWorkbenchId$,
  ]).pipe(
    map(([ready, active]) => {
      return !ready.has(active);
    })
  );

  @IpcEvent({ scope: IpcScope.UI })
  tabGoToRequest$ = new Subject<{ tabId: string; to: string }>();

  constructor(private readonly tabViewsService: TabViewsManager) {}

  @IpcHandle({ scope: IpcScope.UI })
  isActiveTab() {
    const e = getIpcEvent();
    return (
      this.tabViewsService.activeWorkbenchView?.webContents.id === e.sender.id
    );
  }

  @IpcHandle({ scope: IpcScope.UI })
  getWorkbenchMeta(id: string) {
    return this.tabViewsService.tabViewsState.value.workbenches.find(
      w => w.id === id
    );
  }

  @IpcHandle({ scope: IpcScope.UI })
  updateWorkbenchMeta(id: string, patch: Partial<WorkbenchMeta>) {
    const workbench = this.getWorkbenchMeta(id);
    if (!workbench) {
      return;
    }
    this.tabViewsService.updateWorkbenchMeta(workbench.id, patch);
  }

  @IpcHandle({ scope: IpcScope.UI })
  updateActiveViewMeta = (meta: Partial<WorkbenchViewMeta>) => {
    const wc = getIpcEvent().sender;
    const workbenchId = this.tabViewsService.getWorkbenchIdFromWebContentsId(
      wc.id
    );
    const workbench = workbenchId
      ? this.getWorkbenchMeta(workbenchId)
      : undefined;

    if (workbench && workbenchId) {
      return this.tabViewsService.updateWorkbenchViewMeta(
        workbenchId,
        workbench.activeViewIndex,
        meta
      );
    }
  };

  @IpcHandle({ scope: IpcScope.UI })
  getTabViewsMeta() {
    // Return the full tab-views meta of current window
    return this.tabViewsService.tabViewsState.value;
  }

  @IpcHandle({ scope: IpcScope.UI })
  async getTabsStatus() {
    return firstValueFrom(this.tabViewsService.tabsStatus$);
  }

  @IpcHandle({ scope: IpcScope.UI })
  async addTab(option?: AddTabOption) {
    return this.tabViewsService.addTab(option);
  }

  @IpcHandle({ scope: IpcScope.UI })
  async showTab(tabId: string) {
    await this.tabViewsService.showTab(tabId);
  }

  @IpcHandle({ scope: IpcScope.UI })
  async tabGoTo(tabId: string, to: string) {
    this.tabGoToRequest$.next({ tabId, to });
  }

  @IpcHandle({ scope: IpcScope.UI })
  async closeTab(tabId?: string) {
    return this.tabViewsService.closeTab(tabId);
  }

  @IpcHandle({ scope: IpcScope.UI })
  async activateView(tabId: string, viewIndex: number) {
    return this.tabViewsService.activateView(tabId, viewIndex);
  }

  @IpcHandle({ scope: IpcScope.UI })
  moveTab(from: string, to: string, edge?: 'left' | 'right') {
    return this.tabViewsService.moveTab(from, to, edge);
  }

  /**
   * Toggle right sidebar visibility for a given tab.
   */
  @IpcHandle({ scope: IpcScope.UI })
  async toggleRightSidebar(tabId?: string) {
    // If no tab id supplied, default to current active workbench
    tabId ??= this.tabViewsService.activeWorkbenchId;
    if (!tabId) return;
    this.toggleRightSidebar$.next(tabId);
  }

  /**
   * Inform main process that the renderer layout has become (un)ready so
   * the view ordering / resizing can be updated.
   */
  @IpcHandle({ scope: IpcScope.UI })
  pingAppLayoutReady(ready = true) {
    const e = getIpcEvent();
    const workbenchId = this.tabViewsService.getWorkbenchIdFromWebContentsId(
      e.sender.id
    );
    if (!workbenchId) {
      return;
    }
    if (ready) {
      this.tabViewsService.setTabUIReady(workbenchId);
    } else {
      this.tabViewsService.setTabUIUnready(workbenchId);
    }
  }

  @IpcHandle({ scope: IpcScope.UI })
  async showTabContextMenu(tabId: string, viewIndex: number) {
    return this.tabViewsService.showTabContextMenu(tabId, viewIndex);
  }
}
