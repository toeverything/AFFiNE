import type { ConfigStore } from '../store.js';

export class BaseProvider {
  static id = 'memory';
  protected _config: ConfigStore | undefined;

  constructor() {
    // TODO
  }

  init(config: ConfigStore) {
    this._config = config;
  }
}
