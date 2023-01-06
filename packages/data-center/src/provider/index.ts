import type { Workspace } from '@blocksuite/store';

import type { Apis } from '../apis';
import type { DataCenterSignals } from '../datacenter';
import type { getLogger } from '../index';
import type { ConfigStore } from '../store';

export type Logger = ReturnType<typeof getLogger>;

export type InitialParams = {
  apis: Apis;
  config: Readonly<ConfigStore>;
  debug: boolean;
  logger: Logger;
  signals: DataCenterSignals;
  workspace: Workspace;
};

export type { Apis, ConfigStore, DataCenterSignals, Workspace };
export type { BaseProvider } from './base.js';
export { AffineProvider } from './affine/index.js';
export { LocalProvider } from './local/index.js';
