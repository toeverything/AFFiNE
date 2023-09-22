import path from 'node:path';

import { type App, type BrowserWindow, ipcMain } from 'electron';

import { buildType, CLOUD_BASE_URL, isDev } from './config';
import { logger } from './logger';
import {
  handleOpenUrlInHiddenWindow,
  mainWindowOrigin,
  removeCookie,
  restoreOrCreateWindow,
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
    restoreOrCreateWindow()
      .then(() => {
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
  if (url) {
    try {
      const mainWindow = await restoreOrCreateWindow();
      mainWindow.show();
      const urlObj = new URL(url);
      const token = urlObj.searchParams.get('token');

      if (!token) {
        logger.error('no token in url', url);
        return;
      }

      const isSecure = CLOUD_BASE_URL.startsWith('https://');

      // set token to cookie
      await setCookie({
        url: CLOUD_BASE_URL,
        httpOnly: true,
        value: token,
        secure: true,
        name: isSecure
          ? '__Secure-next-auth.session-token'
          : 'next-auth.session-token',
        expirationDate: Math.floor(Date.now() / 1000 + 3600 * 24 * 7),
      });

      // force reset next-auth.callback-url
      // there could be incorrect callback-url in cookie that will cause auth failure
      // so we need to reset it to empty to mitigate this issue
      await removeCookie(
        CLOUD_BASE_URL,
        isSecure ? '__Secure-next-auth.callback-url' : 'next-auth.callback-url'
      );

      let hiddenWindow: BrowserWindow | null = null;

      ipcMain.once('affine:login', () => {
        hiddenWindow?.destroy();
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
