import path from 'node:path';

import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { app } from 'electron';
import { Subject } from 'rxjs';

import { IpcEvent, IpcScope } from '../../../ipc';
import { buildType, isDev } from '../../../shared/constants';
import type { MainWindowManager, TabViewsManager } from '../windows';

let protocol = buildType === 'stable' ? 'affine' : `affine-${buildType}`;
if (isDev) {
  protocol = 'affine-dev';
}

export function setAsDefaultProtocolClient() {
  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient(protocol, process.execPath, [
        path.resolve(process.argv[1]),
      ]);
    }
  } else {
    app.setAsDefaultProtocolClient(protocol);
  }
}

export interface AuthenticationRequest {
  method: 'magic-link' | 'oauth';
  payload: Record<string, any>;
  server?: string;
}

@Injectable()
export class DeepLinkService implements OnModuleInit {
  constructor(
    private readonly mainWindow: MainWindowManager,
    private readonly tabViews: TabViewsManager,
    private readonly logger: Logger
  ) {}

  context = 'deep-link';

  /**
   * Emits when an authentication request is received via deep link.
   */
  @IpcEvent({ scope: IpcScope.UI })
  authenticationRequest$ = new Subject<AuthenticationRequest>();

  onModuleInit() {
    app.on('open-url', (event, url) => {
      this.logger.log('open-url', url, this.context);
      if (url.startsWith(`${protocol}://`)) {
        event.preventDefault();
        app
          .whenReady()
          .then(() => this.handleAffineUrl(url))
          .catch(e => {
            this.logger.error('failed to handle affine url', e);
          });
      }
    });

    // on windows & linux, we need to listen for the second-instance event
    app.on('second-instance', (event, commandLine) => {
      this.mainWindow
        .getMainWindow()
        .then(window => {
          if (!window) {
            this.logger.error('main window is not ready');
            return;
          }
          window.show();
          const url = commandLine.pop();
          if (url?.startsWith(`${protocol}://`)) {
            event.preventDefault();
            this.handleAffineUrl(url).catch(e => {
              this.logger.error('failed to handle affine url', e);
            });
          }
        })
        .catch(e => console.error('Failed to restore or create window:', e));
    });

    app.on('ready', () => {
      // app may be brought up without having a running instance
      // need to read the url from the command line
      const url = process.argv.at(-1);
      this.logger.log('url from argv', process.argv, url);
      if (url?.startsWith(`${protocol}://`)) {
        this.handleAffineUrl(url).catch(e => {
          this.logger.error('failed to handle affine url', e);
        });
      }
    });
  }

  async handleAffineUrl(url: string) {
    this.logger.log('open affine url', url, this.context);
    const urlObj = new URL(url);

    if (urlObj.hostname === 'authentication') {
      const method = urlObj.searchParams.get('method');
      const payload = JSON.parse(urlObj.searchParams.get('payload') ?? 'false');
      const server = urlObj.searchParams.get('server') || undefined;

      if (
        !method ||
        (method !== 'magic-link' && method !== 'oauth') ||
        !payload
      ) {
        this.logger.error('Invalid authentication url', url, this.context);
        return;
      }

      this.authenticationRequest$.next({
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
      await this.tabViews.addTabWithUrl(url);
    } else if (urlObj.searchParams.get('hidden')) {
      const hiddenWindow = await this.mainWindow.openUrlInHiddenWindow(urlObj);
      const main = await this.mainWindow.getMainWindow();
      if (main && hiddenWindow) {
        // when hidden window closed, the main window will be hidden somehow
        hiddenWindow.on('close', () => {
          main.show();
        });
      }
    } else {
      this.logger.error('Unknown affine url', url, this.context);
    }
  }
}
