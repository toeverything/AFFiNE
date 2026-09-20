import { CanActivate, Injectable, UseGuards } from '@nestjs/common';

import { Config } from '../../base/config';
import { OnEvent } from '../../base/event';
import { ServerFeature, ServerService } from '../../core/config';
import { assertCopilotEnabled } from './availability';

@Injectable()
export class CopilotFeatureService {
  constructor(
    private readonly config: Config,
    private readonly server: ServerService
  ) {}

  get enabled() {
    return this.config.copilot.enabled;
  }

  @OnEvent('config.init')
  onConfigInit() {
    this.syncServerFeature();
  }

  @OnEvent('config.changed')
  onConfigChanged(event: Events['config.changed']) {
    if ('copilot' in event.updates) {
      this.syncServerFeature();
    }
  }

  assertEnabled() {
    assertCopilotEnabled(this.config);
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
