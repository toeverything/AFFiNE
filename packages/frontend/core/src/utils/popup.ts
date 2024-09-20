import { DebugLogger } from '@affine/debug';
import { apis } from '@affine/electron-api';

const logger = new DebugLogger('popup');

export function popupWindow(target: string) {
  target = /^https?:\/\//.test(target)
    ? target
    : BUILD_CONFIG.serverUrlPrefix + target;
  const targetUrl = new URL(target);

  let url: string;
  // safe to open directly if in the same origin
  if (targetUrl.origin === location.origin) {
    url = target;
  } else {
    const builder = new URL(BUILD_CONFIG.serverUrlPrefix + '/redirect-proxy');
    builder.searchParams.set('redirect_uri', target);
    url = builder.toString();
  }

  if (BUILD_CONFIG.isElectron) {
    apis?.ui.openExternal(url).catch(e => {
      logger.error('Failed to open external URL', e);
    });
  } else {
    window.open(url, '_blank', `noreferrer noopener`);
  }
}
