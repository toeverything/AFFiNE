import { Observable } from 'rxjs';

import { LiveData } from '../livedata';
import {
  SyncEngineStep,
  type Workspace,
  type WorkspaceLocalState,
} from '../workspace';
import { PageRecord } from './record';

export class PageRecordList {
  constructor(
    private readonly workspace: Workspace,
    private readonly localState: WorkspaceLocalState
  ) {}

  public readonly records = LiveData.from<PageRecord[]>(
    new Observable(subscriber => {
      const emit = () => {
        subscriber.next(
          this.workspace.docCollection.meta.docMetas.map(
            v => new PageRecord(v.id, this.workspace, this.localState)
          )
        );
      };

      emit();

      const dispose =
        this.workspace.docCollection.meta.docMetaUpdated.on(emit).dispose;
      return () => {
        dispose();
      };
    }),
    []
  );

  public readonly isReady = LiveData.from<boolean>(
    new Observable(subscriber => {
      subscriber.next(
        this.workspace.engine.status.sync.step === SyncEngineStep.Synced
      );

      const dispose = this.workspace.engine.onStatusChange.on(() => {
        subscriber.next(
          this.workspace.engine.status.sync.step === SyncEngineStep.Synced
        );
      }).dispose;
      return () => {
        dispose();
      };
    }),
    false
  );

  public record(id: string) {
    return this.records.map(record => record.find(record => record.id === id));
  }
}
