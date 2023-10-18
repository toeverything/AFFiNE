import { DynamicModule } from '@nestjs/common';

import { DocManager } from './manager';
import { RedisDocManager } from './redis-manager';

export class DocModule {
  /**
   * @param automation whether enable update merging automation logic
   */
  private static defModule(automation = true): DynamicModule {
    return {
      module: DocModule,
      providers: [
        {
          provide: 'DOC_MANAGER_AUTOMATION',
          useValue: automation,
        },
        {
          provide: DocManager,
          useClass: globalThis.AFFiNE.redis.enabled
            ? RedisDocManager
            : DocManager,
        },
      ],
      exports: [DocManager],
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

export { DocManager };
