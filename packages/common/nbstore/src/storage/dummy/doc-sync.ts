import { DummyConnection } from '../../connection';
import type {
  DocClock,
  DocClocks,
  PeerWorkspaceState,
  WorkspaceState,
} from '../doc';
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
  private readonly inventories = new Map<string, PeerWorkspaceState>();
  override async getPeerWorkspaceState(peer: string, _rootDocId: string) {
    return (
      this.inventories.get(peer) ?? {
        cacheToken: 0,
        ready: false,
        docs: [],
        clocks: {},
      }
    );
  }
  override async invalidatePeerWorkspaceState(peer: string, rootDocId: string) {
    const state = await this.getPeerWorkspaceState(peer, rootDocId);
    this.inventories.set(peer, { ...state, cacheToken: state.cacheToken + 1 });
  }
  override async installPeerWorkspaceState(
    peer: string,
    rootDocId: string,
    cacheToken: number,
    state: WorkspaceState
  ) {
    if (
      (await this.getPeerWorkspaceState(peer, rootDocId)).cacheToken !==
      cacheToken
    )
      return false;
    this.inventories.set(peer, {
      ...state,
      ready: true,
      cacheToken: cacheToken + 1,
    });
    return true;
  }
  override async confirmPeerDocCreate(_peer: string, _docId: string) {}
}
