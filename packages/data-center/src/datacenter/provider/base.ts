/* eslint-disable @typescript-eslint/no-unused-vars */
import type { Workspace } from '@blocksuite/store';

import type { Logger, InitialParams, ConfigStore } from './index';

export class BaseProvider {
  static id = 'base';
  protected _config!: ConfigStore;
  protected _logger!: Logger;
  protected _workspace!: Workspace;

  constructor() {
    // Nothing to do here
  }

  async init(params: InitialParams) {
    this._config = params.config;
    this._logger = params.logger;
    this._workspace = params.workspace;
    this._logger.enabled = params.debug;
  }

  async clear() {
    await this.destroy();
    await this._config.clear();
  }

  async destroy() {
    // Nothing to do here
  }

  async initData() {
    throw Error('Not implemented: initData');
  }

  // should return a blob url
  async getBlob(_id: string): Promise<string | null> {
    throw Error('Not implemented: getBlob');
  }

  // should return a blob unique id
  async setBlob(_blob: Blob): Promise<string> {
    throw Error('Not implemented: setBlob');
  }

  get workspace() {
    return this._workspace;
  }
}
