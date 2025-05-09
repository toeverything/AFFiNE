import { share } from '../../connection';
import { type DocClock, DocSyncStorageBase } from '../../storage';
import { NativeDBConnection, type SqliteNativeDBOptions } from './db';

export class SqliteDocSyncStorage extends DocSyncStorageBase {
  static readonly identifier = 'SqliteDocSyncStorage';

  override connection = share(new NativeDBConnection(this.options));

  constructor(private readonly options: SqliteNativeDBOptions) {
    super();
  }

  get db() {
    return this.connection.apis;
  }

  override async getPeerRemoteClocks(peer: string) {
    return this.db
      .getPeerRemoteClocks(peer)
      .then(clocks =>
        Object.fromEntries(clocks.map(clock => [clock.docId, clock.timestamp]))
      );
  }

  override async getPeerRemoteClock(peer: string, docId: string) {
    return this.db.getPeerRemoteClock(peer, docId);
  }

  override async setPeerRemoteClock(peer: string, clock: DocClock) {
    await this.db.setPeerRemoteClock(peer, clock.docId, clock.timestamp);
  }

  override async getPeerPulledRemoteClocks(peer: string) {
    return this.db
      .getPeerPulledRemoteClocks(peer)
      .then(clocks =>
        Object.fromEntries(clocks.map(clock => [clock.docId, clock.timestamp]))
      );
  }

  override async getPeerPulledRemoteClock(peer: string, docId: string) {
    return this.db.getPeerPulledRemoteClock(peer, docId);
  }

  override async setPeerPulledRemoteClock(peer: string, clock: DocClock) {
    await this.db.setPeerPulledRemoteClock(peer, clock.docId, clock.timestamp);
  }

  override async getPeerPushedClocks(peer: string) {
    return this.db
      .getPeerPushedClocks(peer)
      .then(clocks =>
        Object.fromEntries(clocks.map(clock => [clock.docId, clock.timestamp]))
      );
  }

  override async getPeerPushedClock(peer: string, docId: string) {
    return this.db.getPeerPushedClock(peer, docId);
  }

  override async setPeerPushedClock(peer: string, clock: DocClock) {
    await this.db.setPeerPushedClock(peer, clock.docId, clock.timestamp);
  }

  override async clearClocks() {
    await this.db.clearClocks();
  }
}
