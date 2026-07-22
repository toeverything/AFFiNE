import path from 'node:path';

import type { App } from 'electron';

import { buildType, isDev } from './config';
import { logger } from './logger';
import { uiSubjects } from './ui';
import {
  addTabWithUrl,
  getMainWindow,
  loadUrlInActiveTab,
  openUrlInHiddenWindow,
  showMainWindow,
} from './windows-manager';

let protocol = buildType === 'stable' ? 'affine' : `affine-${buildType}`;
if (isDev) {
  protocol = 'affine-dev';
}

const authMethods = new Set(['magic-link', 'oauth', 'open-app-signin']);

function summarizeDeepLink(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    const method = url.searchParams.get('method');
    const server = url.searchParams.get('server');
    let serverOrigin: string | undefined;
    try {
      serverOrigin = server ? new URL(server).origin : undefined;
    } catch {
      serverOrigin = undefined;
    }
    return {
      protocol: url.protocol,
      action: url.hostname,
      method: method && authMethods.has(method) ? method : undefined,
      serverOrigin,
    };
  } catch {
    return { valid: false };
  }
}

function logDeepLinkFailure(rawUrl: string, error: unknown) {
  logger.error('failed to handle affine url', summarizeDeepLink(rawUrl), {
    error: error instanceof Error ? error.name : typeof error,
  });
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
    logger.log('open-url', summarizeDeepLink(url));
    if (url.startsWith(`${protocol}://`)) {
      event.preventDefault();
      app
        .whenReady()
        .then(() => handleAffineUrl(url))
        .catch(e => {
          logDeepLinkFailure(url, e);
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
            logDeepLinkFailure(url, e);
          });
        }
      })
      .catch(e => console.error('Failed to restore or create window:', e));
  });

  app.on('ready', () => {
    // app may be brought up without having a running instance
    // need to read the url from the command line
    const url = process.argv.at(-1);
    logger.log(
      'url from argv',
      url?.startsWith(`${protocol}://`)
        ? summarizeDeepLink(url)
        : { deepLink: false, argumentCount: process.argv.length }
    );
    if (url?.startsWith(`${protocol}://`)) {
      handleAffineUrl(url).catch(e => {
        logDeepLinkFailure(url, e);
      });
    }
  });
}

async function handleAffineUrl(url: string) {
  await showMainWindow();

  logger.info('open affine url', summarizeDeepLink(url));
  const urlObj = new URL(url);

  if (urlObj.hostname === 'authentication') {
    const method = urlObj.searchParams.get('method');
    const payload = JSON.parse(urlObj.searchParams.get('payload') ?? 'false');
    const server = urlObj.searchParams.get('server') || undefined;

    if (
      !method ||
      (method !== 'magic-link' &&
        method !== 'oauth' &&
        method !== 'open-app-signin') ||
      !payload
    ) {
      logger.error('Invalid authentication url', summarizeDeepLink(url));
      return;
    }

    uiSubjects.authenticationRequest$.next({
      method,
      payload,
      server,
    });
  } else if (
    urlObj.searchParams.get('new-tab') &&
    urlObj.pathname.startsWith('/workspace')
  ) {
    // @todo(@forehalo): refactor router utilities
    // basename of /workspace/xxx/yyy is /workspace/xxx
    await addTabWithUrl(url);
  } else {
    const hiddenWindow = urlObj.searchParams.get('hidden')
      ? await openUrlInHiddenWindow(urlObj)
      : await loadUrlInActiveTab(url);

    const main = await getMainWindow();
    if (main && hiddenWindow) {
      // when hidden window closed, the main window will be hidden somehow
      hiddenWindow.on('close', () => {
        main.show();
      });
    }
  }
}
