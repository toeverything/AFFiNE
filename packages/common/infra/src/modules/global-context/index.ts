export { GlobalContextService } from './services/global-context';

import type { Framework } from '../../framework';
import { GlobalContext } from './entities/global-context';
import { GlobalContextService } from './services/global-context';

export function configureGlobalContextModule(framework: Framework) {
  framework.service(GlobalContextService).entity(GlobalContext);
}
