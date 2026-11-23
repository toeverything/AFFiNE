import { CanActivate, Injectable, UseGuards } from '@nestjs/common';

import { OnEvent } from '../../base/event';
import { BackendRuntimeProvider } from '../../core/backend-runtime';
import { ServerFeature, ServerService } from '../../core/config';
import { assertCopilotEnabled } from './availability';

@Injectable()
export class CopilotFeatureService {
  constructor(
    private readonly runtime: BackendRuntimeProvider,
    private readonly server: ServerService
  ) {}

  get enabled() {
    return this.runtime.copilotEnabled();
  }

  @OnEvent('config.init')
  onConfigInit() {
    this.syncServerFeature();
  }

  @OnEvent('backendRuntime.configApplied')
  onConfigApplied(event: Events['backendRuntime.configApplied']) {
    if ('copilot' in event.updates) {
      this.syncServerFeature();
    }
  }

  assertEnabled() {
    assertCopilotEnabled(this.enabled);
  }

  private syncServerFeature() {
    if (this.enabled) {
      this.server.enableFeature(ServerFeature.Copilot);
    } else {
      this.server.disableFeature(ServerFeature.Copilot);
    }
  }
}

@Injectable()
export class CopilotFeatureGuard implements CanActivate {
  constructor(private readonly feature: CopilotFeatureService) {}

  canActivate() {
    this.feature.assertEnabled();
    return true;
  }
}

export const CopilotEnabled = () => UseGuards(CopilotFeatureGuard);
