import { DynamicModule } from '@nestjs/common';

import { UpdateManager } from './manager';
import { RedisUpdateManager } from './redis-manager';

export class UpdateManagerModule {
  /**
   * @param automation whether enable update merging automation logic
   */
  private static defModule(automation = true): DynamicModule {
    return {
      module: UpdateManagerModule,
      providers: [
        {
          provide: 'UPDATE_MANAGER_AUTOMATION',
          useValue: automation,
        },
        {
          provide: UpdateManager,
          useClass: globalThis.AFFiNE.redis.enabled
            ? RedisUpdateManager
            : UpdateManager,
        },
      ],
      exports: [UpdateManager],
    };
  }

  static forRoot() {
    return this.defModule();
  }

  static forSync(): DynamicModule {
    return this.defModule(false);
  }

  static forFeature(): DynamicModule {
    return this.defModule(false);
  }
}

export { UpdateManager };
