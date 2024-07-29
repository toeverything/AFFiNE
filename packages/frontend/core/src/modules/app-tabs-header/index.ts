import { type Framework } from '@toeverything/infra';

import { AppTabsHeaderService } from './services/app-tabs-header-service';

export { AppTabsHeader } from './views/app-tabs-header';

export function configureAppTabsHeaderModule(framework: Framework) {
  framework.service(AppTabsHeaderService);
}
