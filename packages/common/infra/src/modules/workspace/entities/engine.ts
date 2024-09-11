import { DisposableGroup } from '@blocksuite/global/utils';
import type { Doc as YDoc } from 'yjs';

import { Entity } from '../../../framework';
import { AwarenessEngine, BlobEngine, DocEngine } from '../../../sync';
import { throwIfAborted } from '../../../utils';
import { WorkspaceEngineBeforeStart } from '../events';
import type { WorkspaceEngineProvider } from '../providers/flavour';
import type { WorkspaceService } from '../services/workspace';

export class WorkspaceEngine extends Entity<{
  engineProvider: WorkspaceEngineProvider;
}> {
  doc = new DocEngine(
    this.props.engineProvider.getDocStorage(),
    this.props.engineProvider.getDocServer()
  );

  blob = new BlobEngine(
    this.props.engineProvider.getLocalBlobStorage(),
    this.props.engineProvider.getRemoteBlobStorages()
  );

  awareness = new AwarenessEngine(
    this.props.engineProvider.getAwarenessConnections()
  );

  private readonly disposableGroup: DisposableGroup;

  constructor(private readonly workspaceService: WorkspaceService) {
    super();
    this.disposableGroup = new DisposableGroup();
    this.disposableGroup.add(
      workspaceService.workspace.docCollection.slots.docCreated.on(id => {
        this.doc.markAsReady(id);
      })
    );
  }

  setRootDoc(yDoc: YDoc) {
    this.doc.setPriority(yDoc.guid, 100);
    this.doc.addDoc(yDoc);
  }

  start() {
    this.eventBus.emit(WorkspaceEngineBeforeStart, this);
    this.doc.start();
    this.awareness.connect(this.workspaceService.workspace.awareness);
    this.blob.start();
  }

  canGracefulStop() {
    return this.doc.engineState$.value.saving === 0;
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

  docEngineState$ = this.doc.engineState$;

  rootDocState$ = this.doc.docState$(this.workspaceService.workspace.id);

  waitForDocSynced() {
    return this.doc.waitForSynced();
  }

  waitForRootDocReady() {
    return this.doc.waitForReady(this.workspaceService.workspace.id);
  }

  override dispose(): void {
    this.forceStop();
    this.doc.dispose();
    this.awareness.dispose();
    this.disposableGroup.dispose();
  }
}
