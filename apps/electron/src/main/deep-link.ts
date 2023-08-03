import type { App } from 'electron';
import { Deeplink } from 'electron-deeplink';

import { buildType, isDev } from './config';
import { logger } from './logger';

let protocol = buildType === 'stable' ? 'affine' : `affine-${buildType}`;
if (isDev) {
  protocol = 'affine-dev';
}

export function setupDeepLink(app: App) {
  const deeplink = new Deeplink({
    app,
    // we don't need it, see https://github.com/glawson/electron-deeplink/blob/e253d9483704b5a7f6fe97b4f51b34b2585a9852/src/index.ts#L150-L155
    mainWindow: null as any,
    protocol,
    isDev,
  });

  deeplink.on('received', link => {
    logger.info('received deeplink', link);
    if (link) {
      openUrl(link);
    }
  });
}

function openUrl(url: string) {
  logger.info('open url', url);
}
