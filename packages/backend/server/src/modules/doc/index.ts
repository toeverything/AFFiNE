import { DynamicModule } from '@nestjs/common';

import { DocHistoryManager } from './history';
import { DocManager } from './manager';

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
        DocManager,
        DocHistoryManager,
      ],
      exports: [DocManager, DocHistoryManager],
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

export { DocHistoryManager, DocManager };
