import { DocEngine, Entity } from '@toeverything/infra';

import type { WebSocketService } from '../../cloud';
import { UserDBDocServer } from '../impls/user-db-doc-server';
import type { UserspaceStorageProvider } from '../provider/storage';

export class UserDBEngine extends Entity<{
  userId: string;
}> {
  private readonly userId = this.props.userId;
  private readonly socket = this.websocketService.newSocket();
  readonly docEngine = new DocEngine(
    this.userspaceStorageProvider.getDocStorage('affine-cloud:' + this.userId),
    new UserDBDocServer(this.userId, this.socket)
  );

  canGracefulStop() {
    // TODO(@eyhn): Implement this
    return true;
  }

  constructor(
    private readonly userspaceStorageProvider: UserspaceStorageProvider,
    private readonly websocketService: WebSocketService
  ) {
    super();
    this.docEngine.start();
  }

  override dispose() {
    this.docEngine.stop();
    this.socket.close();
  }
}
