import { Slot } from '@blocksuite/global/utils';

import { throwIfAborted } from '../../utils/throw-if-aborted';
import type { AwarenessEngine } from './awareness';
import type { BlobEngine, BlobStatus } from './blob';
import type { DocEngine } from './doc';

export interface WorkspaceEngineStatus {
  blob: BlobStatus;
}

/**
 * # WorkspaceEngine
 *
 * sync ydoc, blob, awareness together
 */
export class WorkspaceEngine {
  _status: WorkspaceEngineStatus;
  onStatusChange = new Slot<WorkspaceEngineStatus>();

  get status() {
    return this._status;
  }

  set status(status: WorkspaceEngineStatus) {
    this._status = status;
    this.onStatusChange.emit(status);
  }

  constructor(
    public blob: BlobEngine,
    public doc: DocEngine,
    public awareness: AwarenessEngine
  ) {
    this._status = {
      blob: blob.status,
    };
    blob.onStatusChange.on(status => {
      this.status = {
        blob: status,
      };
    });
  }

  start() {
    this.doc.start();
    this.awareness.connect();
    this.blob.start();
  }

  canGracefulStop() {
    return this.doc.engineState.value.saving === 0;
  }

  async waitForGracefulStop(abort?: AbortSignal) {
    await this.doc.waitForSaved();
    throwIfAborted(abort);
    this.forceStop();
  }

  forceStop() {
    this.doc.stop();
    this.awareness.disconnect();
    this.blob.stop();
  }
}

export * from './awareness';
export * from './blob';
export * from './doc';
export * from './error';
