import type { Framework } from '@toeverything/infra';

import { AuthService } from '../cloud';
import { TelemetryService } from './services/telemetry';

export function configureTelemetryModule(framework: Framework) {
  framework.service(TelemetryService, [AuthService]);
}
