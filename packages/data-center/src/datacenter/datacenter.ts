import { Doc } from 'yjs';

import type { BaseProvider } from './provider/index.js';
import { MemoryProvider } from './provider/index.js';
import { getKVConfigure } from './store.js';

export class DataCenter {
  private readonly _providers = new Map<string, typeof BaseProvider>();
  private readonly _workspaces = new Map<string, Promise<Doc | undefined>>();
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

  private async _initWorkspace(id: string): Promise<Doc> {
    const workspace = new Doc();

    const providerId = await this._config.get(`workspace:${id}:provider`);
    if (this._providers.has(providerId)) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const Provider = this._providers.get(providerId)!;
      const provider = new Provider();
      provider.init(getKVConfigure(id));
    }
    return workspace;
  }

  async getWorkspace(id: string): Promise<Doc | undefined> {
    if (!this._workspaces.has(id)) {
      const workspace = this._initWorkspace(id);
      this._workspaces.set(id, workspace);
    }

    return this._workspaces.get(id);
  }
}
