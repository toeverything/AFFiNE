import { Workspace } from '@blocksuite/store';

import type { BaseProvider } from './provider/index.js';
import { MemoryProvider } from './provider/index.js';
import { getKVConfigure } from './store.js';

export class DataCenter {
  private readonly _providers = new Map<string, typeof BaseProvider>();
  private readonly _workspaces = new Map<string, Promise<Workspace>>();
  private readonly _config;

  static async init(): Promise<DataCenter> {
    const dc = new DataCenter();
    dc.addProvider(MemoryProvider);

    return dc;
  }

  private constructor() {
    this._config = getKVConfigure('sys');
  }

  addProvider(provider: typeof BaseProvider) {
    this._providers.set(provider.id, provider);
  }

  private async _initWorkspace(
    id: string,
    workspace: Workspace,
    providerId: string
  ): Promise<Workspace> {
    const providerKey = `workspace:${id}:provider`;
    const providerValue = await this._config.get(providerKey);
    if (this._providers.has(providerValue || providerId)) {
      if (!providerValue) {
        await this._config.set(providerKey, providerId);
      }
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const Provider = this._providers.get(providerId)!;
      const provider = new Provider();
      await provider.init(getKVConfigure(id), workspace);
    }
    return workspace;
  }

  async initWorkspace(
    id: string,
    workspace: Workspace,
    provider = 'memory'
  ): Promise<Workspace> {
    if (!this._workspaces.has(id)) {
      this._workspaces.set(id, this._initWorkspace(id, workspace, provider));
    }

    return this._workspaces.get(id)!;
  }
}
