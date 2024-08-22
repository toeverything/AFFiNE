import type { Framework } from '@toeverything/infra';

import { SystemFontFamily } from './entities/system-font-family';
import { SystemFontFamilyService } from './services/system-font-family';

export type { FontData } from './entities/system-font-family';
export { SystemFontFamilyService } from './services/system-font-family';

export function configureSystemFontFamilyModule(framework: Framework) {
  framework.service(SystemFontFamilyService).entity(SystemFontFamily);
}
