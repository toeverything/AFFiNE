import * as url from 'lib0/url';
import * as websocket from 'lib0/websocket';

import { Logger } from '../../types';
import { GoogleAuth } from './apis/google';

const RECONNECT_INTERVAL_TIME = 500;
const MAX_RECONNECT_TIMES = 50;

export class WebsocketClient extends websocket.WebsocketClient {
  public shouldReconnect = false;
  private _logger: Logger;
  private _retryTimes = 0;
  private _auth: GoogleAuth;
  constructor(
    serverUrl: string,
    logger: Logger,
    auth: GoogleAuth,
    options?: ConstructorParameters<typeof websocket.WebsocketClient>[1] & {
      params: Record<string, string>;
    }
  ) {
    const params = options?.params || {};
    // ensure that url is always ends with /
    while (serverUrl[serverUrl.length - 1] === '/') {
      serverUrl = serverUrl.slice(0, serverUrl.length - 1);
    }
    const encodedParams = url.encodeQueryParams(params);
    const newUrl =
      serverUrl + '/' + (encodedParams.length === 0 ? '' : '?' + encodedParams);
    super(newUrl, options);
    this._auth = auth;
    this._logger = logger;
    this._setupChannel();
  }

  private _setupChannel() {
    this.on('connect', () => {
      this._logger('Affine channel connected');
      this.shouldReconnect = true;
      this._retryTimes = 0;
    });

    this.on('disconnect', ({ error }: { error: Error }) => {
      if (error) {
        // Try reconnect if connect error has occurred
        if (this.shouldReconnect && this._auth.isLogin && !this.connected) {
          try {
            setTimeout(() => {
              if (this._retryTimes <= MAX_RECONNECT_TIMES) {
                this.connect();
                this._logger(
                  `try reconnect channel ${++this._retryTimes} times`
                );
              } else {
                this._logger('reconnect failed, max reconnect times reached');
              }
            }, RECONNECT_INTERVAL_TIME);
          } catch (e) {
            this._logger('reconnect failed', e);
          }
        }
      }
    });
  }
}
