import assert from 'assert';
import { applyUpdate } from 'yjs';

import type { InitialParams } from '../index.js';
import { token, Callback } from '../../apis/index.js';
import { LocalProvider } from '../local/index.js';

import { WebsocketProvider } from './sync.js';

export class AffineProvider extends LocalProvider {
  static id = 'affine';
  private _onTokenRefresh?: Callback = undefined;
  private _ws?: WebsocketProvider;

  constructor() {
    super();
  }

  async init(params: InitialParams) {
    super.init(params);

    this._onTokenRefresh = () => {
      if (token.refresh) {
        this._config.set('token', token.refresh);
      }
    };
    assert(this._onTokenRefresh);

    token.onChange(this._onTokenRefresh);

    // initial login token
    if (token.isExpired) {
      try {
        const refreshToken = await this._config.get('token');
        await token.refreshToken(refreshToken);

        if (token.refresh) {
          this._config.set('token', token.refresh);
        }

        assert(token.isLogin);
      } catch (_) {
        this._logger('Authorization failed, fallback to local mode');
      }
    } else {
      this._config.set('token', token.refresh);
    }
  }

  async destroy() {
    if (this._onTokenRefresh) {
      token.offChange(this._onTokenRefresh);
    }
    if (this._ws) {
      this._ws.disconnect();
    }
  }

  async initData() {
    await super.initData();

    const workspace = this._workspace;
    const doc = workspace.doc;

    this._logger(`Login: ${token.isLogin}`);

    if (workspace.room && token.isLogin) {
      try {
        const updates = await this._apis.downloadWorkspace(workspace.room);
        if (updates) {
          await new Promise(resolve => {
            doc.once('update', resolve);
            applyUpdate(doc, new Uint8Array(updates));
          });
          // TODO: wait util data loaded
          this._ws = new WebsocketProvider('/', workspace.room, doc);
          // Wait for ws synchronization to complete, otherwise the data will be modified in reverse, which can be optimized later
          await new Promise<void>((resolve, reject) => {
            // TODO: synced will also be triggered on reconnection after losing sync
            // There needs to be an event mechanism to emit the synchronization state to the upper layer
            assert(this._ws);
            this._ws.once('synced', () => resolve());
            this._ws.once('lost-connection', () => resolve());
            this._ws.once('connection-error', () => reject());
          });
        }
      } catch (e) {
        this._logger('Failed to init cloud workspace', e);
      }
    }

    // if after update, the space:meta is empty
    // then we need to get map with doc
    // just a workaround for yjs
    doc.getMap('space:meta');
  }
}
