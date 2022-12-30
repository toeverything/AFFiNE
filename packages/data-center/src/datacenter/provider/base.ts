import { Workspace } from '@blocksuite/store';

import type { ConfigStore } from '../store.js';

export class BaseProvider {
  static id = 'memory';
  protected _config!: ConfigStore;
  protected _workspace!: Workspace;

  constructor() {
    // Nothing to do here
  }

  async init(config: ConfigStore, workspace: Workspace) {
    this._config = config;
    this._workspace = workspace;
  }

  async destroy() {
    // Nothing to do here
  }

  async initData() {
    throw Error('Not implemented: initData');
  }

  get workspace() {
    return this._workspace;
  }
}
