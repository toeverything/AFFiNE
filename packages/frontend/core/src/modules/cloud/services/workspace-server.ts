import { Service } from '@toeverything/infra';

import type { Server } from '../entities/server';

export class WorkspaceServerService extends Service {
  server: Server | null = null;

  bindServer(server: Server) {
    this.server = server;
  }
}
