import { Workspace } from '@blocksuite/store';

import type { ConfigStore } from '../store.js';

export class BaseProvider {
  static id = 'memory';
  protected _config: ConfigStore | undefined;
  protected _workspace: Workspace | undefined;

  constructor() {
    // TODO
  }

  async init(config: ConfigStore, workspace: Workspace) {
    this._config = config;
    this._workspace = workspace;
  }
}
