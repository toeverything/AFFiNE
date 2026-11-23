import { Controller, Get } from '@nestjs/common';

import { SkipThrottle } from './base';
import { Public } from './core/auth';
import { DeploymentType } from './env';
import { ServerConfigHandle } from './native';

@Controller('/info')
export class AppController {
  constructor(private readonly serverConfig: ServerConfigHandle) {}

  @SkipThrottle()
  @Public()
  @Get()
  info() {
    return {
      compatibility: env.version,
      message: `AFFiNE ${env.version} Server`,
      type:
        this.serverConfig.deploymentType === 'selfhosted'
          ? DeploymentType.Selfhosted
          : DeploymentType.Affine,
      flavor: env.FLAVOR,
    };
  }
}
