import { DebugLogger } from '@affine/debug';
import { WorkspaceFlavour } from '@affine/env/workspace';
import { assertExists } from '@blocksuite/global/utils';
import * as url from 'lib0/url';
import * as websocket from 'lib0/websocket';

import { getLoginStorage, isExpired, parseIdToken } from '../affine/login';
import { cleanupWorkspace } from '../utils';

const RECONNECT_INTERVAL_TIME = 500;
const MAX_RECONNECT_TIMES = 50;

export class WebsocketClient {
  public readonly baseServerUrl: string;
  private _client: websocket.WebsocketClient | null = null;
  public shouldReconnect = false;
  private _retryTimes = 0;
  private _logger = new DebugLogger('affine:channel');
  private _callback: ((message: any) => void) | null = null;

  constructor(serverUrl: string) {
    while (serverUrl.endsWith('/')) {
      serverUrl = serverUrl.slice(0, serverUrl.length - 1);
    }
    this.baseServerUrl = serverUrl;
  }

  public connect(callback: (message: any) => void) {
    const loginResponse = getLoginStorage();
    if (!loginResponse || isExpired(parseIdToken(loginResponse.token))) {
      cleanupWorkspace(WorkspaceFlavour.AFFINE);
      return;
    }
    assertExists(loginResponse, 'loginResponse is null');
    const encodedParams = url.encodeQueryParams({
      token: loginResponse.token,
    });
    const serverUrl =
      this.baseServerUrl +
      (encodedParams.length === 0 ? '' : '?' + encodedParams);
    this._client = new websocket.WebsocketClient(serverUrl);
    this._callback = callback;
    this._setupChannel();

    this._client.on('message', this._callback);
  }

  public disconnect() {
    assertExists(this._client, 'client is null');
    if (this._callback) {
      this._client.off('message', this._callback);
    }
    this._client.disconnect();
    this._client.destroy();
    this._client = null;
  }

  private _setupChannel() {
    assertExists(this._client, 'client is null');
    const client = this._client;
    client.on('connect', () => {
      this._logger.debug('Affine channel connected');
      this.shouldReconnect = true;
      this._retryTimes = 0;
    });

    client.on('disconnect', ({ error }: { error: Error }) => {
      if (error) {
        const loginResponse = getLoginStorage();
        const isLogin = loginResponse
          ? isExpired(parseIdToken(loginResponse.token))
          : false;
        // Try to re-connect if connect error has occurred
        if (this.shouldReconnect && isLogin && !client.connected) {
          try {
            setTimeout(() => {
              if (this._retryTimes <= MAX_RECONNECT_TIMES) {
                assertExists(this._callback, 'callback is null');
                this.connect(this._callback);
                this._logger.info(
                  `try reconnect channel ${++this._retryTimes} times`
                );
              } else {
                this._logger.error(
                  'reconnect failed, max reconnect times reached'
                );
              }
            }, RECONNECT_INTERVAL_TIME);
          } catch (e) {
            this._logger.error('reconnect failed', e);
          }
        }
      }
    });
  }
}
