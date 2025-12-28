import { join } from 'node:path';

import { BrowserWindow, nativeTheme } from 'electron';
import electronWindowState from 'electron-window-state';
import { BehaviorSubject, map, shareReplay } from 'rxjs';

import { isLinux, isMacOS, isWindows, resourcesPath } from '../../shared/utils';
import { beforeAppQuit } from '../cleanup';
import { buildType } from '../config';
import { mainWindowOrigin } from '../constants';
import { ensureHelperProcess } from '../helper-process';
import { logger } from '../logger';
import { MenubarStateKey, MenubarStateSchema } from '../shared-state-schema';
import { globalStateStorage } from '../shared-storage/storage';
import { uiSubjects } from '../ui/subject';
import { buildWebPreferences } from '../web-preferences';

const IS_DEV: boolean =
  process.env.NODE_ENV === 'development' && !process.env.CI;

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

  private hiddenMacWindow: BrowserWindow | undefined;

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
    closeAllWindows();
    this.mainWindowReady = undefined;
    this.mainWindow$.next(undefined);
    this.hiddenMacWindow?.destroy();
    this.hiddenMacWindow = undefined;
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

    beforeAppQuit(() => {
      this.cleanupWindows();
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
        // hide window on macOS
        // application quit will be handled by closing the hidden window
        //
        // explanation:
        // - closing the top window (by clicking close button or CMD-w)
        //   - will be captured in "close" event here
        //   - hiding the app to make the app open faster when user click the app icon
        // - quit the app by "cmd+q" or right click on the dock icon and select "quit"
        //   - all browser windows will capture the "close" event
        //   - the hidden window will close all windows
        //   - "window-all-closed" event will be emitted and eventually quit the app
        if (mainWindow.isFullScreen()) {
          mainWindow.once('leave-full-screen', () => {
            mainWindow.hide();
          });
          mainWindow.setFullScreen(false);
        } else {
          mainWindow.hide();
        }
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
      mainWindow.showInactive();
    } else if (
      !TraySettingsState.value.enabled ||
      !TraySettingsState.value.startMinimized
    ) {
      mainWindow.show();
    }

    this.preventMacAppQuit();

    return mainWindow;
  }
}

export async function initAndShowMainWindow() {
  return MainWindowManager.instance.initAndShowMainWindow();
}

export async function getMainWindow() {
  return MainWindowManager.instance.ensureMainWindow();
}

export async function showMainWindow() {
  const window = await getMainWindow();
  if (!window) return;
  if (window.isMinimized()) {
    window.restore();
  }
  window.focus();
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
