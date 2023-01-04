/* eslint-disable @typescript-eslint/no-unused-vars */
import type { Workspace } from '@blocksuite/store';

import type { Apis, Logger, InitialParams, ConfigStore } from './index';

export class BaseProvider {
  static id = 'base';
  protected _apis!: Readonly<Apis>;
  protected _config!: Readonly<ConfigStore>;
  protected _globalConfig!: Readonly<ConfigStore>;
  protected _logger!: Logger;
  protected _workspace!: Workspace;

  constructor() {
    // Nothing to do here
  }

  get id(): string {
    return (this.constructor as any).id;
  }

  async init(params: InitialParams) {
    this._apis = params.apis;
    this._config = params.config;
    this._globalConfig = params.globalConfig;
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

  static async auth(_config: Readonly<ConfigStore>, _logger: Logger) {
    throw Error('Not implemented: auth');
  }

  // get workspace list，return a map of workspace id and boolean
  // if value is true, it exists locally, otherwise it does not exist locally
  static async list(
    _config: Readonly<ConfigStore>
  ): Promise<Map<string, boolean> | undefined> {
    throw Error('Not implemented: list');
  }
}
