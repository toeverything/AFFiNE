import { type Framework, WorkspaceScope } from '@toeverything/infra';

import { AuthService } from '../cloud';
import {
  TelemetryService,
  TelemetryWorkspaceContextService,
} from './services/telemetry';

export function configureTelemetryModule(framework: Framework) {
  framework.service(TelemetryService, [AuthService]);
  framework
    .scope(WorkspaceScope)
    .service(TelemetryWorkspaceContextService, [WorkspaceScope]);
}
