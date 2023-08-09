import type { App } from 'electron';

import { buildType, isDev } from './config';
import { logger } from './logger';
import { handleOpenUrlInPopup } from './main-window';

let protocol = buildType === 'stable' ? 'affine' : `affine-${buildType}`;
if (isDev) {
  protocol = 'affine-dev';
}

export function setupDeepLink(app: App) {
  app.setAsDefaultProtocolClient(protocol);
  app.on('open-url', (event, url) => {
    if (url.startsWith(`${protocol}://`)) {
      event.preventDefault();
      handleAffineUrl(url).catch(e => {
        logger.error('failed to handle affine url', e);
      });
    }
  });
}

async function handleAffineUrl(url: string) {
  logger.info('open affine url', url);
  const urlObj = new URL(url);
  if (urlObj.hostname === 'open-url') {
    const urlToOpen = urlObj.search.slice(1);
    if (urlToOpen) {
      handleOpenUrlInPopup(urlToOpen).catch(e => {
        logger.error('failed to open url in popup', e);
      });
    }
  }
}
