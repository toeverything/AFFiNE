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

  private async _getProvider(id: string, providerId: string): Promise<string> {
    const providerKey = `workspace:${id}:provider`;
    if (this._providers.has(providerId)) {
      await this._config.set(providerKey, providerId);
      return providerId;
    } else {
      const providerValue = await this._config.get(providerKey);
      if (providerValue) return providerValue;
    }
    throw Error(`Provider ${providerId} not found`);
  }

  private async _getWorkspace(id: string, pid: string): Promise<BaseProvider> {
    this._logger(`Init workspace ${id} with ${pid}`);

    const providerId = await this._getProvider(id, pid);

    // init workspace & register block schema
    const workspace = new Workspace({ room: id }).register(BlockSchema);

    const Provider = this._providers.get(providerId);
    assert(Provider);
    const provider = new Provider();

    await provider.init({
      apis: this._apis,
      config: getKVConfigure(id),
      debug: this._logger.enabled,
      logger: this._logger.extend(`${Provider.id}:${id}`),
      workspace,
    });
    await provider.initData();
    this._logger(`Workspace ${id} loaded`);

    return provider;
  }

  async setConfig(workspace: string, config: Record<string, any>) {
    const values = Object.entries(config);
    if (values.length) {
      const configure = getKVConfigure(workspace);
      await configure.setMany(values);
    }
  }

  // load workspace data to memory
  async load(
    workspaceId: string,
    params: LoadConfig = {}
  ): Promise<Workspace | null> {
    const { providerId = 'local', config = {} } = params;
    if (workspaceId) {
      if (!this._workspaces.has(workspaceId)) {
        this._workspaces.set(
          workspaceId,
          this.setConfig(workspaceId, config).then(() =>
            this._getWorkspace(workspaceId, providerId)
          )
        );
      }
      const workspace = this._workspaces.get(workspaceId);
      assert(workspace);
      return workspace.then(w => w.workspace);
    }
    return null;
  }

  // destroy workspace's instance in memory
  async destroy(workspaceId: string) {
    const provider = await this._workspaces.get(workspaceId);
    if (provider) {
      this._workspaces.delete(workspaceId);
      await provider.destroy();
    }
  }

  async reload(
    workspaceId: string,
    config: LoadConfig = {}
  ): Promise<Workspace | null> {
    await this.destroy(workspaceId);
    return this.load(workspaceId, config);
  }

  async list() {
    const keys = await this._config.keys();
    return keys
      .filter(k => k.startsWith('workspace:'))
      .map(k => k.split(':')[1]);
  }

  // delete local workspace's data
  async delete(workspaceId: string) {
    await this._config.delete(`workspace:${workspaceId}:provider`);
    const provider = await this._workspaces.get(workspaceId);
    if (provider) {
      this._workspaces.delete(workspaceId);
      // clear workspace data implement by provider
      await provider.clear();
    }
  }

  // clear all local workspace's data
  async clear() {
    const workspaces = await this.list();
    await Promise.all(workspaces.map(id => this.delete(id)));
  }
}
