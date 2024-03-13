import path from 'node:path';

import { type App, type BrowserWindow, ipcMain } from 'electron';

import { buildType, CLOUD_BASE_URL, isDev } from './config';
import { mainWindowOrigin } from './constants';
import { logger } from './logger';
import {
  getMainWindow,
  handleOpenUrlInHiddenWindow,
  setCookie,
} from './main-window';

let protocol = buildType === 'stable' ? 'affine' : `affine-${buildType}`;
if (isDev) {
  protocol = 'affine-dev';
}

export function setupDeepLink(app: App) {
  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient(protocol, process.execPath, [
        path.resolve(process.argv[1]),
      ]);
    }
  } else {
    app.setAsDefaultProtocolClient(protocol);
  }

  app.on('open-url', (event, url) => {
    if (url.startsWith(`${protocol}://`)) {
      event.preventDefault();
      handleAffineUrl(url).catch(e => {
        logger.error('failed to handle affine url', e);
      });
    }
  });

  // on windows & linux, we need to listen for the second-instance event
  app.on('second-instance', (event, commandLine) => {
    getMainWindow()
      .then(window => {
        if (!window) {
          logger.error('main window is not ready');
          return;
        }
        window.show();
        const url = commandLine.pop();
        if (url?.startsWith(`${protocol}://`)) {
          event.preventDefault();
          handleAffineUrl(url).catch(e => {
            logger.error('failed to handle affine url', e);
          });
        }
      })
      .catch(e => console.error('Failed to restore or create window:', e));
  });
}

async function handleAffineUrl(url: string) {
  logger.info('open affine url', url);
  const urlObj = new URL(url);
  logger.info('handle affine schema action', urlObj.hostname);
  // handle more actions here
  // hostname is the action name
  if (urlObj.hostname === 'signin-redirect') {
    await handleOauthJwt(url);
  }
}

async function handleOauthJwt(url: string) {
  const mainWindow = await getMainWindow();
  if (url && mainWindow) {
    try {
      mainWindow.show();
      const urlObj = new URL(url);
      const token = urlObj.searchParams.get('token');

      if (!token) {
        logger.error('no token in url', url);
        return;
      }

      // set token to cookie
      await setCookie({
        url: CLOUD_BASE_URL,
        httpOnly: true,
        value: token,
        secure: true,
        name: 'sid',
        expirationDate: Math.floor(Date.now() / 1000 + 3600 * 24 * 7),
      });

      let hiddenWindow: BrowserWindow | null = null;

      ipcMain.once('affine:login', () => {
        hiddenWindow?.destroy();
        if (urlObj.searchParams.get('next') === 'onboarding') {
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          mainWindow.loadURL(mainWindowOrigin + '/auth/onboarding');
        }
      });

      // hacks to refresh auth state in the main window
      hiddenWindow = await handleOpenUrlInHiddenWindow(
        mainWindowOrigin + '/auth/signIn'
      );
    } catch (e) {
      logger.error('failed to open url in popup', e);
    }
  }
}
