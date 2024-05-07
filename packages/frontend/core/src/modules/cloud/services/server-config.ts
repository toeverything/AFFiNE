import { ApplicationStarted, OnEvent, Service } from '@toeverything/infra';

import { ServerConfig } from '../entities/server-config';

@OnEvent(ApplicationStarted, e => e.onApplicationStart)
export class ServerConfigService extends Service {
  serverConfig = this.framework.createEntity(ServerConfig);

  private onApplicationStart() {
    this.serverConfig.revalidate();
  }
}
