import { applyUpdate, Doc, encodeStateAsUpdate, encodeStateVector } from 'yjs';

import { fromSnapshot, type Path, type Snapshot, toSnapshot } from './snapshot';

export class ServerClient {
  public static fromDoc(doc: Doc) {
    const doc1 = new Doc();
    applyUpdate(doc1, encodeStateAsUpdate(doc));
    return new ServerClient(doc1);
  }

  public static fromSnapshot(snapshot: Snapshot) {
    const doc = new Doc();
    fromSnapshot(doc, snapshot);
    return new ServerClient(doc);
  }

  constructor(public doc: Doc) {}

  forkClient() {
    return new UserClient(this);
  }
}

export class UserClient {
  doc: Doc;
  onlineUnsub?: () => void;

  constructor(public workspace: ServerClient) {
    this.doc = new Doc();
    this.online();
  }

  private syncFromServer() {
    applyUpdate(
      this.doc,
      encodeStateAsUpdate(this.workspace.doc, encodeStateVector(this.doc))
    );
  }
  private syncToServer() {
    applyUpdate(
      this.workspace.doc,
      encodeStateAsUpdate(this.doc, encodeStateVector(this.workspace.doc))
    );
  }

  online() {
    if (this.onlineUnsub) {
      return;
    }
    this.syncFromServer();
    this.syncToServer();
    const updateSelf = () => {
      this.syncFromServer();
    };
    const updateServer = () => {
      this.syncToServer();
    };
    this.workspace.doc.on('update', updateSelf);
    this.doc.on('update', updateServer);
    this.onlineUnsub = () => {
      this.workspace.doc.off('update', updateSelf);
      this.doc.off('update', updateServer);
    };
  }

  offline() {
    this.onlineUnsub?.();
    this.onlineUnsub = undefined;
  }

  snapshot(...paths: Path[]): Snapshot {
    return toSnapshot(this.doc, ...paths);
  }
}
