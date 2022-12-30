import { Workspace } from '@blocksuite/store';
import assert from 'assert';

import { AffineProvider, BaseProvider } from './provider/index.js';
import { MemoryProvider } from './provider/index.js';
import { getKVConfigure } from './store.js';

export class DataCenter {
  private readonly _providers = new Map<string, typeof BaseProvider>();
  private readonly _workspaces = new Map<string, Promise<BaseProvider>>();
  private readonly _config;

  static async init(): Promise<DataCenter> {
    const dc = new DataCenter();
    dc.addProvider(AffineProvider);
    dc.addProvider(MemoryProvider);

    return dc;
  }

  private constructor() {
    this._config = getKVConfigure('sys');
  }

  addProvider(provider: typeof BaseProvider) {
    this._providers.set(provider.id, provider);
  }

  private async _initWithProvider(id: string, providerId: string) {
    const workspace = new Workspace({ room: id });

    const Provider = this._providers.get(providerId);
    assert(Provider);
    const provider = new Provider();

    console.log(`Loading workspace ${id} with provider ${Provider.id}`);
    await provider.init(getKVConfigure(id), workspace);
    await provider.initData();
    console.log(`Workspace ${id} loaded`);

    return provider;
  }

  private async _initWorkspace(
    id: string,
    providerId: string
  ): Promise<BaseProvider> {
    const providerKey = `workspace:${id}:provider`;
    const providerValue = await this._config.get(providerKey);

    if (this._providers.has(providerValue || providerId)) {
      if (!providerValue) {
        await this._config.set(providerKey, providerId);
      }

      return this._initWithProvider(id, await this._config.get(providerKey));
    } else {
      throw Error(`provider ${providerId} not found`);
    }
  }

  async initWorkspace(id: string, provider = 'memory'): Promise<Workspace> {
    if (!this._workspaces.has(id)) {
      this._workspaces.set(id, this._initWorkspace(id, provider));
    }
    const workspace = this._workspaces.get(id);
    assert(workspace);
    return workspace.then(w => w.workspace);
  }

  setWorkspaceConfig(workspace: string, key: string, value: any) {
    const config = getKVConfigure(workspace);
    return config.set(key, value);
  }
}
