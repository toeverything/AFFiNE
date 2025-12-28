import { join } from 'node:path';

import { I18n } from '@affine/i18n';
import {
  app,
  BrowserWindow,
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

import { isMacOS } from '../../shared/utils';
import { beforeAppQuit, onTabClose } from '../cleanup';
import { mainWindowOrigin, shellViewUrl } from '../constants';
import { ensureHelperProcess } from '../helper-process';
import { logger } from '../logger';
import {
  SpellCheckStateKey,
  SpellCheckStateSchema,
  TabViewsMetaKey,
  type TabViewsMetaSchema,
  tabViewsMetaSchema,
  type WorkbenchMeta,
  type WorkbenchViewMeta,
} from '../shared-state-schema';
import { globalStateStorage } from '../shared-storage/storage';
import { buildWebPreferences } from '../web-preferences';
import { getMainWindow, MainWindowManager } from './main-window';

async function getAdditionalArguments() {
  const { getExposedMeta } = await import('../exposed');
  const mainExposedMeta = getExposedMeta();
  const helperProcessManager = await ensureHelperProcess();
  const helperExposedMeta = await helperProcessManager.rpc?.getMeta();
  return [
    `--main-exposed-meta=` + JSON.stringify(mainExposedMeta),
    `--helper-exposed-meta=` + JSON.stringify(helperExposedMeta),
    `--window-name=main`,
  ];
}

const TabViewsMetaState = {
  $: globalStateStorage.watch<TabViewsMetaSchema>(TabViewsMetaKey).pipe(
    map(v => tabViewsMetaSchema.parse(v ?? {})),
    shareReplay(1)
  ),

  set value(value: TabViewsMetaSchema) {
    globalStateStorage.set(TabViewsMetaKey, value);
  },

  get value() {
    return tabViewsMetaSchema.parse(
      globalStateStorage.get(TabViewsMetaKey) ?? {}
    );
  },

  // shallow merge
  patch(patch: Partial<TabViewsMetaSchema>) {
    this.value = {
      ...this.value,
      ...patch,
    };
  },
};

const spellCheckSettings = SpellCheckStateSchema.parse(
  globalStateStorage.get(SpellCheckStateKey) ?? {}
);

type AddTabAction = {
  type: 'add-tab';
  payload: WorkbenchMeta;
};

type CloseTabAction = {
  type: 'close-tab';
  payload?: string;
};

type PinTabAction = {
  type: 'pin-tab';
  payload: { key: string; shouldPin: boolean };
};

type ActivateViewAction = {
  type: 'activate-view';
  payload: { tabId: string; viewIndex: number };
};

type SeparateViewAction = {
  type: 'separate-view';
  payload: { tabId: string; viewIndex: number };
};

type OpenInSplitViewAction = {
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

export class WebContentViewsManager {
  static readonly instance = new WebContentViewsManager(
    MainWindowManager.instance
  );

  private constructor(public mainWindowManager: MainWindowManager) {
    this.setup();
  }

  readonly tabViewsMeta$ = TabViewsMetaState.$;
  readonly appTabsUIReady$ = new BehaviorSubject(new Set<string>());

  get appTabsUIReady() {
    return this.appTabsUIReady$.value;
  }

  // all web views
  readonly webViewsMap$ = new BehaviorSubject(
    new Map<string, WebContentsView>()
  );

  readonly tabsStatus$ = combineLatest([
    this.tabViewsMeta$.pipe(startWith(TabViewsMetaState.value)),
    this.webViewsMap$,
    this.appTabsUIReady$,
  ]).pipe(
    map(([viewsMeta, views, ready]) => {
      return viewsMeta.workbenches.map(w => {
        return {
          id: w.id,
          pinned: !!w.pinned,
          active: viewsMeta.activeWorkbenchId === w.id,
          loaded: views.has(w.id),
          ready: ready.has(w.id),
          activeViewIndex: w.activeViewIndex,
          views: w.views,
          basename: w.basename,
        };
      });
    }),
    shareReplay(1)
  );

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
  readonly tabAction$ = new Subject<TabAction>();

  cookies: Electron.Cookie[] = [];

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
    return TabViewsMetaState.value;
  }

  private set tabViewsMeta(meta: TabViewsMetaSchema) {
    TabViewsMetaState.value = meta;
  }

  readonly patchTabViewsMeta = (patch: Partial<TabViewsMetaSchema>) => {
    TabViewsMetaState.patch(patch);
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

    this.showTab(activeWorkbenchKey).catch(error => logger.error(error));

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
      logger.info(`loading tab ${id} at ${url.href}`);
      view.webContents.loadURL(url.href).catch(err => logger.error(err));
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
    this.updateBackgroundThrottling();
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
    addTab(newTabMeta).catch(err => logger.error(err));
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

      handleWebContentsResize(activeView?.webContents).catch(err =>
        logger.error(err)
      );
    }
  };

  setup = () => {
    const windowReadyToShow$ = this.mainWindowManager.mainWindow$.pipe(
      filter(w => !!w)
    );

    const disposables: Unsubscribable[] = [];
    disposables.push(
      windowReadyToShow$.subscribe(w => {
        handleWebContentsResize().catch(err => logger.error(err));
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
        this.createAndAddView('shell').catch(err => logger.error(err));
        (async () => {
          if (this.tabViewsMeta.workbenches.length === 0) {
            // create a default view (e.g., on first launch)
            await this.addTab();
          } else {
            const defaultTabId = this.activeWorkbenchId;
            if (defaultTabId) await this.showTab(defaultTabId);
          }
        })().catch(err => logger.error(err));
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
      this.updateBackgroundThrottling();
    });
    this.mainWindow?.on('blur', () => {
      this.updateBackgroundThrottling();
    });

    combineLatest([
      this.activeWorkbenchId$,
      this.mainWindowManager.mainWindow$,
    ]).subscribe(([_, window]) => {
      // makes sure the active view is always focused
      if (window?.isFocused()) {
        focusActiveView();
        this.updateBackgroundThrottling();
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
      logger.error('shell view is already created');
    }

    const start = performance.now();

    const additionalArguments = await getAdditionalArguments();
    const helperProcessManager = await ensureHelperProcess();
    // will be added to appInfo
    additionalArguments.push(`--view-id=${viewId}`);

    const view = new WebContentsView({
      webPreferences: buildWebPreferences({
        webgl: true,
        transparent: true,
        spellcheck: spellCheckSettings.enabled,
        preload: join(__dirname, './preload.js'), // this points to the bundled preload module
        // serialize exposed meta that to be used in preload
        additionalArguments: additionalArguments,
        backgroundThrottling: true,
      }),
    });

    view.webContents.on('context-menu', (_event, params) => {
      const menu = Menu.buildFromTemplate([
        {
          id: 'cut',
          label: I18n['com.affine.context-menu.cut'](),
          role: 'cut',
          enabled: params.editFlags.canCut,
        },
        {
          id: 'copy',
          label: I18n['com.affine.context-menu.copy'](),
          role: 'copy',
          enabled: params.editFlags.canCopy,
        },
        {
          id: 'paste',
          label: I18n['com.affine.context-menu.paste'](),
          role: 'paste',
          enabled: params.editFlags.canPaste,
        },
      ]);

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

    this.webViewsMap$.next(this.tabViewsMap.set(viewId, view));
    let disconnectHelperProcess: (() => void) | null = null;

    // shell process do not need to connect to helper process
    if (type !== 'shell') {
      view.webContents.on('did-finish-load', () => {
        disconnectHelperProcess?.();
        disconnectHelperProcess = helperProcessManager.connectRenderer(
          view.webContents
        );
        this.updateBackgroundThrottling();
      });
    } else {
      view.webContents.on('focus', () => {
        globalThis.setTimeout(() => {
          // when shell is focused, focus the active app view instead (to make sure global keybindings work)
          this.activeWorkbenchView?.webContents.focus();
        });
      });

      view.webContents.loadURL(shellViewUrl).catch(err => logger.error(err));
    }

    view.webContents.on('destroyed', () => {
      disconnectHelperProcess?.();
      disconnectHelperProcess = null;
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
      this.updateBackgroundThrottling();
    });

    this.resizeView(view);

    view.webContents.on('did-finish-load', () => {
      this.resizeView(view);
      if (process.env.SKIP_ONBOARDING) {
        this.skipOnboarding(view).catch(err => logger.error(err));
      }
    });

    // reorder will add to main window when loaded
    this.reorderViews();

    logger.info(`view ${viewId} created in ${performance.now() - start}ms`);
    return view;
  };

  private readonly updateBackgroundThrottling = () => {
    const mainFocused = this.mainWindow?.isFocused() ?? false;
    const activeId = this.activeWorkbenchId;
    this.webViewsMap$.value.forEach((view, id) => {
      if (id === 'shell') {
        return;
      }
      const shouldThrottle = !mainFocused || id !== activeId;
      try {
        view.webContents.setBackgroundThrottling(shouldThrottle);
      } catch (err) {
        logger.warn('failed to set backgroundThrottling', err);
      }
    });
    if (this.shellView) {
      const shellThrottle = !mainFocused;
      try {
        this.shellView.webContents.setBackgroundThrottling(shellThrottle);
      } catch (err) {
        logger.warn('failed to set shell backgroundThrottling', err);
      }
    }
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

// there is no proper way to listen to webContents resize event
// we will rely on window.resize event in renderer instead
export async function handleWebContentsResize(webContents?: WebContents) {
  // right now when window is resized, we will relocate the traffic light positions
  if (isMacOS()) {
    const window = await getMainWindow();
    const factor = webContents?.getZoomFactor() || 1;
    window?.setWindowButtonPosition({ x: 14 * factor, y: 14 * factor - 2 });
  }
}

export function onTabViewsMetaChanged(
  fn: (appViewMeta: TabViewsMetaSchema) => void
) {
  const sub = WebContentViewsManager.instance.tabViewsMeta$.subscribe(meta => {
    fn(meta);
  });
  return () => {
    sub.unsubscribe();
  };
}

export const onTabShellViewActiveChange = (fn: (active: boolean) => void) => {
  const sub = combineLatest([
    WebContentViewsManager.instance.appTabsUIReady$,
    WebContentViewsManager.instance.activeWorkbenchId$,
  ]).subscribe(([ready, active]) => {
    fn(!ready.has(active));
  });

  return () => {
    sub.unsubscribe();
  };
};

export const getTabsStatus = () => {
  return firstValueFrom(WebContentViewsManager.instance.tabsStatus$);
};

export const onTabsStatusChange = (
  fn: (
    tabs: {
      id: string;
      active: boolean;
      loaded: boolean;
      ready: boolean;
      pinned: boolean;
      activeViewIndex: number;
      views: WorkbenchViewMeta[];
      basename: string;
    }[]
  ) => void
) => {
  const sub = WebContentViewsManager.instance.tabsStatus$.subscribe(tabs => {
    fn(tabs);
  });

  return () => {
    sub.unsubscribe();
  };
};

export const updateWorkbenchMeta = (
  id: string,
  meta: Partial<Omit<WorkbenchMeta, 'id'>>
) => {
  WebContentViewsManager.instance.updateWorkbenchMeta(id, meta);
};

export const updateWorkbenchViewMeta = (
  workbenchId: string,
  viewId: string | number,
  meta: Partial<WorkbenchViewMeta>
) => {
  WebContentViewsManager.instance.updateWorkbenchViewMeta(
    workbenchId,
    viewId,
    meta
  );
};

export const getWorkbenchMeta = (id: string) => {
  return TabViewsMetaState.value.workbenches.find(w => w.id === id);
};

export const updateActiveViewMeta = (
  wc: WebContents,
  meta: Partial<WorkbenchViewMeta>
) => {
  const workbenchId =
    WebContentViewsManager.instance.getWorkbenchIdFromWebContentsId(wc.id);
  const workbench = workbenchId ? getWorkbenchMeta(workbenchId) : undefined;

  if (workbench && workbenchId) {
    return WebContentViewsManager.instance.updateWorkbenchViewMeta(
      workbenchId,
      workbench.activeViewIndex,
      meta
    );
  }
};

export const getTabViewsMeta = () => TabViewsMetaState.value;
export const isActiveTab = (wc: WebContents) => {
  return (
    wc.id ===
    WebContentViewsManager.instance.activeWorkbenchView?.webContents.id
  );
};

// parse the full pathname to basename and pathname
// eg: /workspace/xxx/yyy => { basename: '/workspace/xxx', pathname: '/yyy' }
export const parseFullPathname = (url: string) => {
  const urlObj = new URL(url);
  const basename = urlObj.pathname.match(/\/workspace\/[^/]+/g)?.[0] ?? '/';
  return {
    basename,
    pathname: urlObj.pathname.slice(basename.length),
    search: urlObj.search,
    hash: urlObj.hash,
  };
};

export const addTab = WebContentViewsManager.instance.addTab;
export const addTabWithUrl = (url: string) => {
  const { basename, pathname, search, hash } = parseFullPathname(url);
  return addTab({
    basename,
    view: {
      path: { pathname, search, hash },
    },
  });
};

export const loadUrlInActiveTab = async (_url: string) => {
  // todo: implement
  throw new Error('loadUrlInActiveTab not implemented');
};
export const ensureTabLoaded = async (tabId: string) => {
  const tab = WebContentViewsManager.instance.tabViewsMap.get(tabId);
  if (tab) {
    return tab;
  }
  return WebContentViewsManager.instance.loadTab(tabId);
};
export const showTab = WebContentViewsManager.instance.showTab;
export const closeTab = WebContentViewsManager.instance.closeTab;
export const undoCloseTab = WebContentViewsManager.instance.undoCloseTab;
export const activateView = WebContentViewsManager.instance.activateView;
export const moveTab = WebContentViewsManager.instance.moveTab;
export const openInSplitView = WebContentViewsManager.instance.openInSplitView;

export const reloadView = async () => {
  const id = WebContentViewsManager.instance.activeWorkbenchId;
  if (id) {
    await WebContentViewsManager.instance.loadTab(id);
  }
};

export const onTabAction = (fn: (event: TabAction) => void) => {
  const { unsubscribe } =
    WebContentViewsManager.instance.tabAction$.subscribe(fn);

  return unsubscribe;
};

export const onActiveTabChanged = (fn: (tabId: string) => void) => {
  const sub = WebContentViewsManager.instance.activeWorkbenchId$.subscribe(fn);
  return () => {
    sub.unsubscribe();
  };
};

export const showDevTools = (id?: string) => {
  // use focusedWindow?
  const focusedWindow = BrowserWindow.getFocusedWindow();
  // check if focused window is main window
  const mainWindow = WebContentViewsManager.instance.mainWindow;
  if (focusedWindow && focusedWindow.id !== mainWindow?.id) {
    focusedWindow.webContents.openDevTools();
  } else {
    const view = id
      ? WebContentViewsManager.instance.getViewById(id)
      : WebContentViewsManager.instance.activeWorkbenchView;
    if (view) {
      view.webContents.openDevTools();
    }
  }
};

export const pingAppLayoutReady = (wc: WebContents, ready: boolean) => {
  const viewId =
    WebContentViewsManager.instance.getWorkbenchIdFromWebContentsId(wc.id);
  if (viewId) {
    if (ready) {
      WebContentViewsManager.instance.setTabUIReady(viewId);
    } else {
      WebContentViewsManager.instance.setTabUIUnready(viewId);
    }
  }
};

export const switchTab = (n: number) => {
  const item = WebContentViewsManager.instance.tabViewsMeta.workbenches.at(
    n === 9 ? -1 : n - 1
  );
  if (item) {
    WebContentViewsManager.instance
      .showTab(item.id)
      .catch(err => logger.error(err));
  }
};

export const switchToNextTab = () => {
  const length =
    WebContentViewsManager.instance.tabViewsMeta.workbenches.length;
  const activeIndex = WebContentViewsManager.instance.activeWorkbenchIndex;
  const item = WebContentViewsManager.instance.tabViewsMeta.workbenches.at(
    activeIndex === length - 1 ? 0 : activeIndex + 1
  );
  if (item) {
    WebContentViewsManager.instance
      .showTab(item.id)
      .catch(err => logger.error(err));
  }
};

export const switchToPreviousTab = () => {
  const length =
    WebContentViewsManager.instance.tabViewsMeta.workbenches.length;
  const activeIndex = WebContentViewsManager.instance.activeWorkbenchIndex;
  const item = WebContentViewsManager.instance.tabViewsMeta.workbenches.at(
    activeIndex === 0 ? length - 1 : activeIndex - 1
  );
  if (item) {
    WebContentViewsManager.instance
      .showTab(item.id)
      .catch(err => logger.error(err));
  }
};
