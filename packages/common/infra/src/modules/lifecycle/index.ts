import type { Framework } from '../../framework';
import { LifecycleService } from './service/lifecycle';

export { ApplicationStarted, LifecycleService } from './service/lifecycle';

export function configureLifecycleModule(framework: Framework) {
  framework.service(LifecycleService);
}
