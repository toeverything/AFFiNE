import { DummyConnection } from '../../connection';
import type { DocClock, DocClocks } from '../doc';
import { DocSyncStorageBase } from '../doc-sync';

export class DummyDocSyncStorage extends DocSyncStorageBase {
  override getPeerRemoteClock(
    _peer: string,
    _docId: string
  ): Promise<DocClock | null> {
    return Promise.resolve(null);
  }
  override getPeerRemoteClocks(_peer: string): Promise<DocClocks> {
    return Promise.resolve({});
  }
  override setPeerRemoteClock(_peer: string, _clock: DocClock): Promise<void> {
    return Promise.resolve();
  }
  override getPeerPulledRemoteClock(
    _peer: string,
    _docId: string
  ): Promise<DocClock | null> {
    return Promise.resolve(null);
  }
  override getPeerPulledRemoteClocks(_peer: string): Promise<DocClocks> {
    return Promise.resolve({});
  }
  override setPeerPulledRemoteClock(
    _peer: string,
    _clock: DocClock
  ): Promise<void> {
    return Promise.resolve();
  }
  override getPeerPushedClock(
    _peer: string,
    _docId: string
  ): Promise<DocClock | null> {
    return Promise.resolve(null);
  }
  override getPeerPushedClocks(_peer: string): Promise<DocClocks> {
    return Promise.resolve({});
  }
  override setPeerPushedClock(_peer: string, _clock: DocClock): Promise<void> {
    return Promise.resolve();
  }
  override clearClocks(): Promise<void> {
    return Promise.resolve();
  }
  override connection = new DummyConnection();
}
