import type { Framework } from '@toeverything/infra';

import { configureMobileSearchModule } from './search';

export function configureMobileModules(framework: Framework) {
  configureMobileSearchModule(framework);
}
