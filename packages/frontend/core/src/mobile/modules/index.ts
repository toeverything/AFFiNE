import type { Framework } from '@toeverything/infra';

import { configureMobileBackCoordinator } from './back-coordinator';
import { configureMobileHapticsModule } from './haptics';
import { configureMobileNavigationProjection } from './navigation-projection';
import { configureMobileSearchModule } from './search';
import { configureMobileVirtualKeyboardModule } from './virtual-keyboard';

export function configureMobileModules(framework: Framework) {
  configureMobileBackCoordinator(framework);
  configureMobileSearchModule(framework);
  configureMobileVirtualKeyboardModule(framework);
  configureMobileNavigationProjection(framework);
  configureMobileHapticsModule(framework);
}
