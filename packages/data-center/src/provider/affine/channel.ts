import * as websocket from 'lib0/websocket';
import { Logger } from 'src/types';
import { token } from './apis/token';
import * as url from 'lib0/url';

const RECONNECT_INTERVAL_TIME = 5000;
const MAX_RECONNECT_TIMES = 50;

export class WebsocketClient extends websocket.WebsocketClient {
  public shouldReconnect = false;
  private _reconnectInterval: number | null = null;
  private _logger: Logger;
  constructor(
    serverUrl: string,
    logger: Logger,
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
    this._logger = logger;
    this._setupChannel();
  }

  private _setupChannel() {
    this.on('connect', () => {
      this._logger('Affine channel connected');
      this.shouldReconnect = true;
      if (this._reconnectInterval) {
        window.clearInterval(this._reconnectInterval);
      }
    });

    this.on('disconnect', ({ error }: { error: Error }) => {
      if (error) {
        let times = 0;
        // Try reconnect if connect error has occurred
        this._reconnectInterval = window.setInterval(() => {
          if (this.shouldReconnect && token.isLogin && !this.connected) {
            try {
              this.connect();
              this._logger(`try reconnect channel ${++times} times`);
              if (times > MAX_RECONNECT_TIMES) {
                this._logger('reconnect failed, max reconnect times reached');
                this._reconnectInterval &&
                  window.clearInterval(this._reconnectInterval);
              }
            } catch (e) {
              this._logger('reconnect failed', e);
            }
          }
        }, RECONNECT_INTERVAL_TIME);
      }
    });
  }
}
