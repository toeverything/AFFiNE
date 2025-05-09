import type { PropertyMetaConfig } from '@blocksuite/data-view';
import { createIdentifier } from '@blocksuite/global/di';

export interface DatabaseBlockConfigService {
  propertiesPresets: PropertyMetaConfig[];
}

export const DatabaseBlockConfigService =
  createIdentifier<DatabaseBlockConfigService>(
    'AffineDatabaseBlockConfigService'
  );
