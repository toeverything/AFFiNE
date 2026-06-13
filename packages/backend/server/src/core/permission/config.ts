import { z } from 'zod';

import { defineModuleConfig } from '../../base';

export enum PermissionReadModel {
  Legacy = 'legacy',
  Projection = 'projection',
}

declare global {
  interface AppConfigSchema {
    permission: {
      readModel: PermissionReadModel;
      fallbackLegacyLoader: boolean;
    };
  }
}

defineModuleConfig('permission', {
  readModel: {
    desc: 'Permission data source for Rust evaluation',
    default: PermissionReadModel.Projection,
    shape: z.nativeEnum(PermissionReadModel),
    env: ['AFFINE_PERMISSION_READ_MODEL', 'string'],
  },
  fallbackLegacyLoader: {
    desc: 'Fallback from projection loader to legacy loader when projection input loading fails',
    default: false,
    env: ['AFFINE_PERMISSION_FALLBACK_LEGACY_LOADER', 'boolean'],
  },
});
