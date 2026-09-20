import type { Framework } from '@toeverything/infra';

import { MobileBackCoordinator } from './back-coordinator';

export type {
  MobileBackIntent,
  MobileDestinationKind,
  MobileInteractiveBackPhase,
  MobileRestorationSnapshot,
  MobileSourceToken,
} from './back-coordinator';
export {
  isMobileRootDestination,
  MobileBackCoordinator,
} from './back-coordinator';
export { useMobileVisualLayer } from './visual-layer';

export function configureMobileBackCoordinator(framework: Framework) {
  framework.service(MobileBackCoordinator);
}
