import { join } from 'node:path';

import { app, BrowserWindow, nativeTheme } from 'electron';
import electronWindowState from 'electron-window-state';
import { BehaviorSubject, map, shareReplay } from 'rxjs';

import { mainWindowOrigin } from '../../shared/internal-origin';
import { isLinux, isMacOS, isWindows, resourcesPath } from '../../shared/utils';
import { beforeAppQuit } from '../cleanup';
import { buildType } from '../config';
import { ensureHelperProcess } from '../helper-process';
import { logger } from '../logger';
import { MenubarStateKey, MenubarStateSchema } from '../shared-state-schema';
import { globalStateStorage } from '../shared-storage/storage';
import { uiSubjects } from '../ui/subject';
import { buildWebPreferences } from '../web-preferences';

const IS_DEV: boolean =
  process.env.NODE_ENV === 'development' && !process.env.CI;
const DOCK_VISIBILITY_THROTTLE_MS = 1100;
const FULL_SCREEN_EXIT_TIMEOUT_MS = 2000;

const TraySettingsState = {
  $: globalStateStorage.watch<MenubarStateSchema>(MenubarStateKey).pipe(
    map(v => MenubarStateSchema.parse(v ?? {})),
    shareReplay(1)
  ),

  get value() {
    return MenubarStateSchema.parse(
      globalStateStorage.get(MenubarStateKey) ?? {}
    );
  },
};

function closeAllWindows() {
  BrowserWindow.getAllWindows().forEach(w => {
    if (!w.isDestroyed()) {
      w.destroy();
    }
  });
}

export class MainWindowManager {
  static readonly instance = new MainWindowManager();
  mainWindowReady: Promise<BrowserWindow> | undefined;
  mainWindow$ = new BehaviorSubject<BrowserWindow | undefined>(undefined);

  private backgroundRequested = false;
  private hiddenMacWindow: BrowserWindow | undefined;
  private lastDockShowAt = 0;
  private pendingDockHide: ReturnType<typeof setTimeout> | undefined;

  private constructor() {
    const traySettingsSubscription = TraySettingsState.$.subscribe(state => {
      if (!state.enabled || !state.closeToTray) {
        void this.ensureDockVisible().catch(err => {
          logger.error('Failed to restore Dock visibility:', err);
        });
      }
    });

    beforeAppQuit(() => {
      traySettingsSubscription.unsubscribe();
      this.cancelPendingDockHide();
      this.cleanupWindows();
    });
  }

  get mainWindow() {
    return this.mainWindow$.value;
  }

  // #region private methods
  private preventMacAppQuit() {
    if (!this.hiddenMacWindow && isMacOS()) {
      this.hiddenMacWindow = new BrowserWindow({
        show: false,
        width: 100,
        height: 100,
        webPreferences: buildWebPreferences(),
      });
      this.hiddenMacWindow.on('close', () => {
        this.cleanupWindows();
      });
    }
  }

  private cleanupWindows() {
    this.cancelPendingDockHide();
    closeAllWindows();
    this.mainWindowReady = undefined;
    this.mainWindow$.next(undefined);
    this.hiddenMacWindow?.destroy();
    this.hiddenMacWindow = undefined;
  }

  private cancelPendingDockHide() {
    if (this.pendingDockHide) {
      clearTimeout(this.pendingDockHide);
      this.pendingDockHide = undefined;
    }
  }

  private shouldHideDock() {
    const settings = TraySettingsState.value;
    return (
      isMacOS() &&
      this.backgroundRequested &&
      settings.enabled &&
      settings.closeToTray
    );
  }

  private async showDock() {
    this.cancelPendingDockHide();
    if (app.isReady() && app.dock && !app.dock.isVisible()) {
      await app.dock.show();
      this.lastDockShowAt = Date.now();
    }
  }

  private scheduleDockHide(mainWindow: BrowserWindow) {
    this.cancelPendingDockHide();
    if (!app.dock || !this.shouldHideDock()) {
      return;
    }

    const hideDock = () => {
      this.pendingDockHide = undefined;
      if (
        this.shouldHideDock() &&
        !mainWindow.isDestroyed() &&
        !mainWindow.isVisible()
      ) {
        app.dock?.hide();
      }
    };
    const delay =
      DOCK_VISIBILITY_THROTTLE_MS - (Date.now() - this.lastDockShowAt);
    if (delay > 0) {
      this.pendingDockHide = setTimeout(hideDock, delay);
    } else {
      hideDock();
    }
  }

  private async hideMainWindow(mainWindow: BrowserWindow) {
    this.backgroundRequested = true;
    this.cancelPendingDockHide();

    if (mainWindow.isFullScreen()) {
      await new Promise<void>(resolve => {
        const done = () => {
          clearTimeout(timeout);
          mainWindow.removeListener('leave-full-screen', done);
          mainWindow.removeListener('closed', done);
          resolve();
        };
        const timeout = setTimeout(done, FULL_SCREEN_EXIT_TIMEOUT_MS);
        mainWindow.once('leave-full-screen', done);
        mainWindow.once('closed', done);
        mainWindow.setFullScreen(false);
      });
    }

    if (this.backgroundRequested && !mainWindow.isDestroyed()) {
      mainWindow.hide();
      this.scheduleDockHide(mainWindow);
    }
  }

  private async createMainWindow() {
    logger.info('create window');
    const mainWindowState = electronWindowState({
      defaultWidth: 1000,
      defaultHeight: 800,
    });

    const browserWindow = new BrowserWindow({
      titleBarStyle: isMacOS()
        ? 'hiddenInset'
        : isWindows()
          ? 'hidden'
          : 'default',
      x: mainWindowState.x,
      y: mainWindowState.y,
      width: mainWindowState.width,
      autoHideMenuBar: isLinux(),
      minWidth: 640,
      minHeight: 480,
      visualEffectState: 'active',
      vibrancy: 'under-window',
      // backgroundMaterial: 'mica',
      height: mainWindowState.height,
      show: false, // Use 'ready-to-show' event to show window
      webPreferences: buildWebPreferences({
        webgl: true,
      }),
    });
    const helper = await ensureHelperProcess();
    helper.connectMain(browserWindow);

    if (isLinux()) {
      browserWindow.setIcon(
        // __dirname is `packages/frontend/apps/electron/dist` (the bundled output directory)
        join(resourcesPath, `icons/icon_${buildType}_64x64.png`)
      );
    }

    nativeTheme.themeSource = 'light';
    mainWindowState.manage(browserWindow);

    this.bindEvents(browserWindow);
    return browserWindow;
  }

  private bindEvents(mainWindow: BrowserWindow) {
    /**
     * If you install `show: true` then it can cause issues when trying to close the window.
     * Use `show: false` and listener events `ready-to-show` to fix these issues.
     *
     * @see https://github.com/electron/electron/issues/25012
     */
    mainWindow.on('ready-to-show', () => {
      logger.info('main window is ready to show');

      uiSubjects.onMaximized$.next(mainWindow.isMaximized());
      uiSubjects.onFullScreen$.next(mainWindow.isFullScreen());
    });

    mainWindow.on('close', e => {
      // TODO(@pengx17): gracefully close the app, for example, ask user to save unsaved changes
      e.preventDefault();
      if (!isMacOS()) {
        if (
          TraySettingsState.value.enabled &&
          TraySettingsState.value.closeToTray
        ) {
          mainWindow.hide();
        } else {
          closeAllWindows();
          this.mainWindowReady = undefined;
          this.mainWindow$.next(undefined);
        }
      } else {
        void this.hideMainWindow(mainWindow).catch(err => {
          logger.error('Failed to hide main window:', err);
        });
      }
    });

    const refreshBound = (timeout = 0) => {
      setTimeout(() => {
        if (mainWindow.isDestroyed()) return;
        // FIXME: workaround for theme bug in full screen mode
        const size = mainWindow.getSize();
        mainWindow.setSize(size[0] + 1, size[1] + 1);
        mainWindow.setSize(size[0], size[1]);
      }, timeout);
    };

    mainWindow.on('leave-full-screen', () => {
      // seems call this too soon may cause the app to crash
      refreshBound();
      refreshBound(1000);
      uiSubjects.onMaximized$.next(false);
      uiSubjects.onFullScreen$.next(false);
    });

    mainWindow.on('maximize', () => {
      uiSubjects.onMaximized$.next(true);
    });

    mainWindow.on('unmaximize', () => {
      uiSubjects.onMaximized$.next(false);
    });

    // full-screen == maximized in UI on windows
    mainWindow.on('enter-full-screen', () => {
      uiSubjects.onFullScreen$.next(true);
    });

    mainWindow.on('leave-full-screen', () => {
      uiSubjects.onFullScreen$.next(false);
    });
  }
  // #endregion

  async ensureMainWindow(): Promise<BrowserWindow> {
    if (
      !this.mainWindowReady ||
      (await this.mainWindowReady.then(w => w.isDestroyed()))
    ) {
      this.mainWindowReady = this.createMainWindow();
      this.mainWindow$.next(await this.mainWindowReady);
      this.preventMacAppQuit();
    }
    return this.mainWindowReady;
  }

  /**
   * Init main BrowserWindow. Will create a new window if it's not created yet.
   */
  async initAndShowMainWindow() {
    const mainWindow = await this.ensureMainWindow();

    if (IS_DEV) {
      // do not gain focus in dev mode
      this.backgroundRequested = false;
      await this.showDock();
      mainWindow.showInactive();
    } else if (
      !TraySettingsState.value.enabled ||
      !TraySettingsState.value.startMinimized
    ) {
      await this.showMainWindow();
    }

    this.preventMacAppQuit();

    return mainWindow;
  }

  async showMainWindow() {
    this.backgroundRequested = false;
    const mainWindow = await this.ensureMainWindow();
    await this.showDock();
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.show();
    mainWindow.focus();
    return mainWindow;
  }

  async closeMainWindowToBackground() {
    await this.hideMainWindow(await this.ensureMainWindow());
  }

  async ensureDockVisible() {
    if (!this.shouldHideDock()) {
      await this.showDock();
    }
  }
}

export async function initAndShowMainWindow() {
  return MainWindowManager.instance.initAndShowMainWindow();
}

export async function getMainWindow() {
  return MainWindowManager.instance.ensureMainWindow();
}

export async function showMainWindow() {
  return MainWindowManager.instance.showMainWindow();
}

export async function closeMainWindowToBackground() {
  return MainWindowManager.instance.closeMainWindowToBackground();
}

export async function ensureDockVisible() {
  return MainWindowManager.instance.ensureDockVisible();
}

const getWindowAdditionalArguments = async () => {
  const { getExposedMeta } = await import('../exposed');
  const mainExposedMeta = getExposedMeta();
  return [
    `--main-exposed-meta=` + JSON.stringify(mainExposedMeta),
    `--window-name=hidden-window`,
  ];
};

function transformToAppUrl(url: URL) {
  const params = url.searchParams;
  return mainWindowOrigin + url.pathname + '?' + params.toString();
}

/**
 * Open a URL in a hidden window.
 */
export async function openUrlInHiddenWindow(urlObj: URL) {
  const url = transformToAppUrl(urlObj);
  const win = new BrowserWindow({
    width: 1200,
    height: 600,
    webPreferences: buildWebPreferences({
      preload: join(__dirname, './preload.js'),
      additionalArguments: await getWindowAdditionalArguments(),
    }),
    show: BUILD_CONFIG.debug,
  });

  if (BUILD_CONFIG.debug) {
    win.webContents.openDevTools();
  }

  logger.info('loading page at', url);
  win.loadURL(url).catch(e => {
    logger.error('failed to load url', e);
  });
  return win;
}
