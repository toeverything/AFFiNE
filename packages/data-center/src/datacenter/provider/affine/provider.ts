import assert from 'assert';
import { Workspace } from '@blocksuite/store';
import { BaseProvider } from '../base.js';
import { ConfigStore } from '../index.js';
import { token } from './token.js';
import { Callback } from './events.js';

export class AffineProvider extends BaseProvider {
  static id = 'affine';
  private _onTokenRefresh?: Callback = undefined;

  constructor() {
    super();
  }

  async init(config: ConfigStore, workspace: Workspace) {
    super.init(config, workspace);

    this._onTokenRefresh = () => {
      if (token.refresh) {
        this._config.set('token', token.refresh);
      }
    };
    assert(this._onTokenRefresh);

    token.onChange(this._onTokenRefresh);
    if (token.isExpired) {
      const refreshToken = await this._config.get('token');
      await token.refreshToken(refreshToken);
    }
  }

  async destroy() {
    if (this._onTokenRefresh) {
      token.offChange(this._onTokenRefresh);
    }
  }

  async initData() {
    console.log('initData', token.isLogin);
  }
}
