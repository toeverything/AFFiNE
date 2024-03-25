import { configureWorkspaceImplServices } from '@affine/workspace-impl';
import type { ServiceCollection } from '@toeverything/infra';
import { configureInfraServices } from '@toeverything/infra';

import {
  configureBusinessServices,
  configureWebInfraServices,
} from './modules/services';

export function configureWebServices(services: ServiceCollection) {
  configureInfraServices(services);
  configureWebInfraServices(services);
  configureBusinessServices(services);
  configureWorkspaceImplServices(services);
}
