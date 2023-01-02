import assert from 'assert';
import { applyUpdate } from 'yjs';

import type { InitialParams } from '../index.js';
import { LocalProvider } from '../local/index.js';

import { downloadWorkspace } from './apis.js';
import { token, Callback } from './token.js';

export class AffineProvider extends LocalProvider {
  static id = 'affine';
  private _onTokenRefresh?: Callback = undefined;

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
  }

  async initData() {
    await super.initData();

    const workspace = this._workspace;
    const doc = workspace.doc;

    this._logger(`Login: ${token.isLogin}`);

    if (workspace.room && token.isLogin) {
      try {
        const updates = await downloadWorkspace(workspace.room);
        if (updates) {
          applyUpdate(doc, new Uint8Array(updates));
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
