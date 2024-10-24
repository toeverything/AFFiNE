import { DebugLogger } from '@affine/debug';
import { apis } from '@affine/electron-api';
import { Browser } from '@capacitor/browser';

const logger = new DebugLogger('popup');

const origin =
  BUILD_CONFIG.isElectron || BUILD_CONFIG.isIOS || BUILD_CONFIG.isAndroid
    ? BUILD_CONFIG.serverUrlPrefix
    : location.origin;

/**
 * @deprecated need to be refactored as [UrlService] dependencies on [ServerConfigService]
 */
export function popupWindow(target: string) {
  const isFullUrl = /^https?:\/\//.test(target);

  const redirectProxy = origin + '/redirect-proxy';
  target = isFullUrl ? target : origin + target;

  const targetUrl = new URL(target);

  let url: string;
  // safe to open directly if in the same origin
  if (targetUrl.origin === origin) {
    url = target;
  } else {
    const search = new URLSearchParams({
      redirect_uri: target,
    });

    url = `${redirectProxy}?${search.toString()}`;
  }

  if (BUILD_CONFIG.isElectron) {
    apis?.ui.openExternal(url).catch(e => {
      logger.error('Failed to open external URL', e);
    });
  } else if (BUILD_CONFIG.isIOS || BUILD_CONFIG.isAndroid) {
    Browser.open({
      url,
      presentationStyle: 'popover',
    }).catch(console.error);
  } else {
    window.open(url, '_blank', `noreferrer noopener`);
  }
}
