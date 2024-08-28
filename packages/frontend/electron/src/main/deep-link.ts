import path from 'node:path';

import type { App } from 'electron';

import { buildType, isDev } from './config';
import { mainWindowOrigin } from './constants';
import { logger } from './logger';
import {
  getMainWindow,
  openUrlInHiddenWindow,
  openUrlInMainWindow,
} from './windows-manager';

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

  if (urlObj.hostname === 'bring-to-front') {
    const mainWindow = await getMainWindow();
    if (mainWindow) {
      mainWindow.show();
    }
  } else {
    await openUrl(urlObj);
  }
}

async function openUrl(urlObj: URL) {
  const params = urlObj.searchParams;

  const openInHiddenWindow = params.get('hidden');
  params.delete('hidden');

  const url = mainWindowOrigin + urlObj.pathname + '?' + params.toString();
  if (!openInHiddenWindow) {
    await openUrlInHiddenWindow(url);
  } else {
    // TODO(@pengx17): somehow the page won't load the url passed, help needed
    await openUrlInMainWindow(url);
  }
}
