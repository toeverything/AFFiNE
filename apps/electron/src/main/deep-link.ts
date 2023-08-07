import type { App } from 'electron';

import { buildType, isDev } from './config';
import { logger } from './logger';

let protocol = buildType === 'stable' ? 'affine' : `affine-${buildType}`;
if (isDev) {
  protocol = 'affine-dev';
}

export function setupDeepLink(app: App) {
  app.setAsDefaultProtocolClient(protocol);
  app.on('open-url', (event, url) => {
    if (url.startsWith(`${protocol}://`)) {
      event.preventDefault();
      handleAffineUrl(url);
    }
  });
}

function handleAffineUrl(url: string) {
  logger.info('open affine url', url);
}
