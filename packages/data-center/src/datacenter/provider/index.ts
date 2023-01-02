import type { Workspace } from '@blocksuite/store';

import type { getLogger } from '../index';
import type { ConfigStore } from '../store';

export type Logger = ReturnType<typeof getLogger>;

export type InitialParams = {
  config: ConfigStore;
  logger: Logger;
  workspace: Workspace;
};

export type { ConfigStore, Workspace };
export type { BaseProvider } from './base.js';
export { AffineProvider } from './affine/index.js';
export { LocalProvider } from './local/index.js';
