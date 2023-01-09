import assert from 'assert';
import { BlockSchema } from '@blocksuite/blocks/models';
import { Workspace, Signal } from '@blocksuite/store';

import { getLogger } from './index.js';
import { getApis, Apis } from './apis/index.js';
import {
  AffineProvider,
  BaseProvider,
  LocalProvider,
  SelfHostedProvider,
} from './provider/index.js';

import { getKVConfigure } from './store.js';
import { TauriIPCProvider } from './provider/tauri-ipc/index.js';

// load workspace's config
type LoadConfig = {
  // use witch provider load data
  providerId?: string;
  // provider config
  config?: Record<string, any>;
};

export type DataCenterSignals = DataCenter['signals'];
type WorkspaceItem = {
  // provider id
  provider: string;
  // data exists locally
  locally: boolean;
};
type WorkspaceLoadEvent = WorkspaceItem & {
  workspace: string;
};

export class DataCenter {
  private readonly _apis: Apis;
  private readonly _providers = new Map<string, typeof BaseProvider>();
  private readonly _workspaces = new Map<string, Promise<BaseProvider>>();
  private readonly _config;
  private readonly _logger;

  readonly signals = {
    listAdd: new Signal<WorkspaceLoadEvent>(),
    listRemove: new Signal<string>(),
  };

  static async init(debug: boolean): Promise<DataCenter> {
    const dc = new DataCenter(debug);
    dc.addProvider(AffineProvider);
    dc.addProvider(LocalProvider);
    // use ipc provider when client app's preload script inject the global flag.
    if (typeof window !== 'undefined' && window.CLIENT_APP) {
      dc.addProvider(TauriIPCProvider);
    }
    dc.addProvider(SelfHostedProvider);

    return dc;
  }

  private constructor(debug: boolean) {
    this._apis = getApis();
    this._config = getKVConfigure('sys');
    this._logger = getLogger('dc');
    this._logger.enabled = debug;

    this.signals.listAdd.on(e => {
      this._config.set(`list:${e.workspace}`, {
        provider: e.provider,
        locally: e.locally,
      });
    });
    this.signals.listRemove.on(workspace => {
      this._config.delete(`list:${workspace}`);
    });
  }

  get apis(): Readonly<Apis> {
    return this._apis;
  }

  private addProvider(provider: typeof BaseProvider) {
    this._providers.set(provider.id, provider);
  }

  private async _getProvider(
    id: string,
    providerId = 'local'
  ): Promise<string> {
    const providerKey = `${id}:provider`;
    if (this._providers.has(providerId)) {
      await this._config.set(providerKey, providerId);
      return providerId;
    } else {
      const providerValue = await this._config.get(providerKey);
      if (providerValue) return providerValue;
    }
    throw Error(`Provider ${providerId} not found`);
  }

  private async _getWorkspace(
    id: string,
    params: LoadConfig
  ): Promise<BaseProvider> {
    this._logger(`Init workspace ${id} with ${params.providerId}`);

    const providerId = await this._getProvider(id, params.providerId);

    // init workspace & register block schema
    const workspace = new Workspace({ room: id }).register(BlockSchema);

    const Provider = this._providers.get(providerId);
    assert(Provider);

    // initial configurator
    const config = getKVConfigure(`workspace:${id}`);
    // set workspace configs
    const values = Object.entries(params.config || {});
    if (values.length) await config.setMany(values);

    // init data by provider
    const provider = new Provider();
    await provider.init({
      apis: this._apis,
      config,
      debug: this._logger.enabled,
      logger: this._logger.extend(`${Provider.id}:${id}`),
      signals: this.signals,
      workspace,
    });
    await provider.initData();
    this._logger(`Workspace ${id} loaded`);

    return provider;
  }

  async auth(providerId: string, globalConfig?: Record<string, any>) {
    const Provider = this._providers.get(providerId);
    if (Provider) {
      // initial configurator
      const config = getKVConfigure(`provider:${providerId}`);
      // set workspace configs
      const values = Object.entries(globalConfig || {});
      if (values.length) await config.setMany(values);

      const logger = this._logger.extend(`auth:${providerId}`);
      logger.enabled = this._logger.enabled;
      await Provider.auth(config, logger, this.signals);
    }
  }

  /**
   * load workspace data to memory
   * @param workspaceId workspace id
   * @param config.providerId provider id
   * @param config.config provider config
   * @returns Workspace instance
   */
  async load(
    workspaceId: string,
    params: LoadConfig = {}
  ): Promise<Workspace | null> {
    if (workspaceId) {
      if (!this._workspaces.has(workspaceId)) {
        this._workspaces.set(
          workspaceId,
          this._getWorkspace(workspaceId, params)
        );
      }
      const workspace = this._workspaces.get(workspaceId);
      assert(workspace);
      return workspace.then(w => w.workspace);
    }
    return null;
  }

  /**
   * destroy workspace's instance in memory
   * @param workspaceId workspace id
   */
  async destroy(workspaceId: string) {
    const provider = await this._workspaces.get(workspaceId);
    if (provider) {
      this._workspaces.delete(workspaceId);
      await provider.destroy();
    }
  }

  /**
   * reload new workspace instance to memory to refresh config
   * @param workspaceId workspace id
   * @param config.providerId provider id
   * @param config.config provider config
   * @returns Workspace instance
   */
  async reload(
    workspaceId: string,
    config: LoadConfig = {}
  ): Promise<Workspace | null> {
    await this.destroy(workspaceId);
    return this.load(workspaceId, config);
  }

  /**
   * get workspace list，return a map of workspace id and data state
   * data state is also map, the key is the provider id, and the data exists locally when the value is true, otherwise it does not exist
   */
  async list(): Promise<Record<string, Record<string, boolean>>> {
    const entries: [string, WorkspaceItem][] = await this._config.entries();
    return entries.reduce((acc, [k, i]) => {
      if (k.startsWith('list:')) {
        const key = k.slice(5);
        acc[key] = acc[key] || {};
        acc[key][i.provider] = i.locally;
      }
      return acc;
    }, {} as Record<string, Record<string, boolean>>);
  }

  /**
   * delete local workspace's data
   * @param workspaceId workspace id
   */
  async delete(workspaceId: string) {
    await this._config.delete(`${workspaceId}:provider`);
    const provider = await this._workspaces.get(workspaceId);
    if (provider) {
      this._workspaces.delete(workspaceId);
      // clear workspace data implement by provider
      await provider.clear();
    }
  }

  /**
   * clear all local workspace's data
   */
  async clear() {
    const workspaces = await this.list();
    await Promise.all(Object.keys(workspaces).map(id => this.delete(id)));
  }
}
