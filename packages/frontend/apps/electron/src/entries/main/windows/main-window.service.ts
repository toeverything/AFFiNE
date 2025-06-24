import { join } from 'node:path';

import { Injectable, Logger } from '@nestjs/common';
import { BrowserWindow, nativeTheme } from 'electron';
import electronWindowState from 'electron-window-state';
import { BehaviorSubject } from 'rxjs';

import { IpcEvent, IpcHandle, IpcScope } from '../../../ipc';
import { buildType, isDev } from '../../../shared/constants';
import { mainWindowOrigin, resourcesPath } from '../constants';
import { HelperProcessManager } from '../helper-process';
import { isLinux, isMacOS, isWindows } from '../utils';

function closeAllWindows() {
  BrowserWindow.getAllWindows().forEach(w => {
    if (!w.isDestroyed()) {
      w.destroy();
    }
  });
}

@Injectable()
export class MainWindowManager {
  context = 'main-window';

  @IpcEvent({ scope: IpcScope.UI })
  maximized$ = new BehaviorSubject<boolean>(false);

  @IpcEvent({ scope: IpcScope.UI })
  fullScreen$ = new BehaviorSubject<boolean>(false);

  mainWindowReady: Promise<BrowserWindow> | undefined;
  mainWindow$ = new BehaviorSubject<BrowserWindow | undefined>(undefined);
  private hiddenMacWindow: BrowserWindow | undefined;

  constructor(
    private readonly logger: Logger,
    private readonly helperProcessService: HelperProcessManager
  ) {}

  get mainWindow() {
    return this.mainWindow$.value;
  }

  private preventMacAppQuit() {
    if (!this.hiddenMacWindow && isMacOS()) {
      this.hiddenMacWindow = new BrowserWindow({
        show: false,
        width: 100,
        height: 100,
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
    this.logger.log('create window', this.context);
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
      height: mainWindowState.height,
      show: false, // Use 'ready-to-show' event to show window
      webPreferences: {
        webgl: true,
        contextIsolation: true,
        sandbox: false,
      },
    });

    if (isLinux()) {
      browserWindow.setIcon(
        join(resourcesPath, `icons/icon_${buildType}_64x64.png`)
      );
    }

    nativeTheme.themeSource = 'light';
    mainWindowState.manage(browserWindow);

    this.bindEvents(browserWindow);

    await this.helperProcessService.ready;
    this.helperProcessService.connectMain(browserWindow);

    return browserWindow;
  }

  private bindEvents(mainWindow: BrowserWindow) {
    mainWindow.on('ready-to-show', () => {
      this.logger.log('main window is ready to show', this.context);
      this.maximized$.next(mainWindow.isMaximized());
      this.fullScreen$.next(mainWindow.isFullScreen());
    });

    mainWindow.on('close', e => {
      e.preventDefault();
      if (!isMacOS()) {
        closeAllWindows();
        this.mainWindowReady = undefined;
        this.mainWindow$.next(undefined);
      } else {
        // hide window on macOS
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
        const size = mainWindow.getSize();
        mainWindow.setSize(size[0] + 1, size[1] + 1);
        mainWindow.setSize(size[0], size[1]);
      }, timeout);
    };

    mainWindow.on('leave-full-screen', () => {
      refreshBound();
      refreshBound(1000);
      this.maximized$.next(false);
      this.fullScreen$.next(false);
    });

    mainWindow.on('maximize', () => {
      this.maximized$.next(true);
    });

    mainWindow.on('unmaximize', () => {
      this.maximized$.next(false);
    });

    // full-screen == maximized in UI on windows
    mainWindow.on('enter-full-screen', () => {
      this.fullScreen$.next(true);
    });

    mainWindow.on('leave-full-screen', () => {
      this.fullScreen$.next(false);
    });
  }

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

  async initAndShowMainWindow() {
    const mainWindow = await this.ensureMainWindow();

    if (isDev) {
      // do not gain focus in dev mode
      mainWindow.showInactive();
    } else {
      mainWindow.show();
    }

    this.preventMacAppQuit();

    return mainWindow;
  }

  async getMainWindow() {
    return this.ensureMainWindow();
  }

  @IpcHandle({ scope: IpcScope.UI, name: 'showMainWindow' })
  async show() {
    const window = await this.getMainWindow();
    if (!window) return;
    if (window.isMinimized()) {
      window.restore();
    }
    window.focus();
  }

  @IpcHandle({ scope: IpcScope.UI })
  handleThemeChange(theme: (typeof nativeTheme)['themeSource']) {
    nativeTheme.themeSource = theme;
  }

  @IpcHandle({ scope: IpcScope.UI })
  isFullScreen() {
    return this.mainWindow?.isFullScreen() ?? false;
  }

  @IpcHandle({ scope: IpcScope.UI })
  isMaximized() {
    return this.mainWindow?.isMaximized() ?? false;
  }

  @IpcHandle({ scope: IpcScope.UI })
  handleMinimizeApp() {
    this.mainWindow?.minimize();
  }

  @IpcHandle({ scope: IpcScope.UI })
  handleHideApp() {
    this.mainWindow?.hide();
  }

  @IpcHandle({ scope: IpcScope.UI })
  handleMaximizeApp() {
    const window = this.mainWindow;
    if (!window) return;
    // allow unmaximize when in full screen mode
    if (window.isFullScreen()) {
      window.setFullScreen(false);
      window.unmaximize();
    } else if (window.isMaximized()) {
      window.unmaximize();
    } else {
      window.maximize();
    }
  }

  transformToAppUrl(url: URL) {
    const params = url.searchParams;
    return mainWindowOrigin + url.pathname + '?' + params.toString();
  }

  /**
   * Open a URL in a hidden window.
   */
  async openUrlInHiddenWindow(urlObj: URL) {
    const url = this.transformToAppUrl(urlObj);
    const win = new BrowserWindow({
      width: 1200,
      height: 600,
      webPreferences: {
        preload: join(__dirname, './preload.js'),
        additionalArguments: [`--window-name=hidden-window`],
      },
      show: BUILD_CONFIG.debug,
    });

    if (BUILD_CONFIG.debug) {
      win.webContents.openDevTools();
    }

    this.logger.log('loading page at', url, this.context);
    win.loadURL(url).catch(e => {
      this.logger.error('failed to load url', e, this.context);
    });
    return win;
  }
}
