import assert from 'assert';
import { BlockSchema } from '@blocksuite/blocks/models';
import { Workspace } from '@blocksuite/store';

import { getLogger } from './index.js';
import { getApis, Apis } from './apis/index.js';
import { AffineProvider, BaseProvider } from './provider/index.js';
import { LocalProvider } from './provider/index.js';
import { getKVConfigure } from './store.js';

// load workspace's config
type LoadConfig = {
  // use witch provider load data
  providerId?: string;
  // provider config
  config?: Record<string, any>;
};

export class DataCenter {
  private readonly _apis: Apis;
  private readonly _providers = new Map<string, typeof BaseProvider>();
  private readonly _workspaces = new Map<string, Promise<BaseProvider>>();
  private readonly _config;
  private readonly _logger;

  static async init(debug: boolean): Promise<DataCenter> {
    const dc = new DataCenter(debug);
    dc.addProvider(AffineProvider);
    dc.addProvider(LocalProvider);

    return dc;
  }

  private constructor(debug: boolean) {
    this._apis = getApis();
    this._config = getKVConfigure('sys');
    this._logger = getLogger('dc');
    this._logger.enabled = debug;
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
      globalConfig: getKVConfigure(`provider:${providerId}`),
      debug: this._logger.enabled,
      logger: this._logger.extend(`${Provider.id}:${id}`),
      workspace,
    });
    await provider.initData();
    this._logger(`Workspace ${id} loaded`);

    return provider;
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
    const lists = await Promise.all(
      Array.from(this._providers.entries()).map(([providerId, provider]) =>
        provider
          .list(getKVConfigure(`provider:${providerId}`))
          .then(list => [providerId, list || []] as const)
      )
    );

    return lists.reduce((ret, [providerId, list]) => {
      for (const [item, isLocal] of list) {
        const workspace = ret[item] || {};
        workspace[providerId] = isLocal;
        ret[item] = workspace;
      }
      return ret;
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
