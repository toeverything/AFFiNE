import assert from 'assert';
import { BlockSchema } from '@blocksuite/blocks/models';
import { Workspace } from '@blocksuite/store';

import { getLogger } from './index.js';
import { AffineProvider, BaseProvider } from './provider/index.js';
import { LocalProvider } from './provider/index.js';
import { getKVConfigure } from './store.js';

export class DataCenter {
  private readonly _providers = new Map<string, typeof BaseProvider>();
  private readonly _workspaces = new Map<string, Promise<BaseProvider>>();
  private readonly _config;
  private readonly _logger;

  static async init(): Promise<DataCenter> {
    const dc = new DataCenter();
    dc.addProvider(AffineProvider);
    dc.addProvider(LocalProvider);

    return dc;
  }

  private constructor() {
    this._config = getKVConfigure('sys');
    this._logger = getLogger('dc');
    this._logger.enabled = true;
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

  private async _initWorkspace(id: string, pid: string): Promise<BaseProvider> {
    this._logger(`Init workspace ${id} with ${pid}`);

    const providerId = await this._getProvider(id, pid);

    // init workspace & register block schema
    const workspace = new Workspace({ room: id }).register(BlockSchema);

    const Provider = this._providers.get(providerId);
    assert(Provider);
    const provider = new Provider();

    await provider.init({
      config: getKVConfigure(id),
      logger: this._logger.extend(`${Provider.id}:${id}`),
      workspace,
    });
    await provider.initData();
    this._logger(`Workspace ${id} loaded`);

    return provider;
  }

  async initWorkspace(
    id: string,
    provider = 'local'
  ): Promise<Workspace | null> {
    if (id) {
      if (!this._workspaces.has(id)) {
        this._workspaces.set(id, this._initWorkspace(id, provider));
      }
      const workspace = this._workspaces.get(id);
      assert(workspace);
      return workspace.then(w => w.workspace);
    }
    return null;
  }

  setWorkspaceConfig(workspace: string, key: string, value: any) {
    const config = getKVConfigure(workspace);
    return config.set(key, value);
  }

  async getWorkspaceList() {
    const keys = await this._config.keys();
    return keys
      .filter(k => k.startsWith('workspace:'))
      .map(k => k.split(':')[1]);
  }
}
