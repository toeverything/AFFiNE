import type { App } from 'electron';
import { BrowserView } from 'electron';

import { buildType, isDev } from './config';
import { logger } from './logger';
import { restoreOrCreateWindow } from './main-window';

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
    const window = await restoreOrCreateWindow();
    const urlToOpen = urlObj.search.slice(1);
    if (urlToOpen) {
      const view = new BrowserView();
      window.addBrowserView(view);
      const bounds = window.getBounds();
      view.setAutoResize({ width: true, height: true });
      view.setBounds({
        x: 0,
        y: 0,
        width: bounds.width,
        height: bounds.height,
      });
      view.webContents.loadURL(urlToOpen).catch(e => {
        logger.error('failed to load url', e);
      });
      // close view on main webview reload
      window.webContents.on('did-finish-load', () => {
        window.removeBrowserView(view);
      });
    }
  }
}
