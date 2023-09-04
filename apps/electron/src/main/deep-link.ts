import path from 'node:path';

import type { App } from 'electron';

import { buildType, CLOUD_BASE_URL, isDev } from './config';
import { logger } from './logger';
import {
  handleOpenUrlInHiddenWindow,
  mainWindowOrigin,
  restoreOrCreateWindow,
  setCookie,
} from './main-window';
import { uiSubjects } from './ui';

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
  if (urlObj.hostname === 'oauth-jwt') {
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
      await setCookie({
        url: CLOUD_BASE_URL,
        httpOnly: true,
        name: 'next-auth.callback-url',
      });

      // hacks to refresh auth state in the main window
      const window = await handleOpenUrlInHiddenWindow(
        mainWindowOrigin + '/auth/signIn'
      );
      uiSubjects.onFinishLogin.next({
        success: true,
      });
      setTimeout(() => {
        window.destroy();
      }, 3000);
    } catch (e) {
      logger.error('failed to open url in popup', e);
    }
  }
}
