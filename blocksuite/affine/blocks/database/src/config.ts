import { ConfigExtensionFactory } from '@blocksuite/std';

import type { DatabaseViewExtensionOptions } from './view';

export const DatabaseConfigExtension =
  ConfigExtensionFactory<DatabaseViewExtensionOptions>('affine:database');
