import { Observable } from 'rxjs';

import { LiveData } from '../livedata';
import { type Workspace, type WorkspaceLocalState } from '../workspace';
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

  public readonly isReady = this.workspace.engine.doc
    .docState(this.workspace.id)
    .map(state => !state.syncing);

  public record(id: string) {
    return this.records.map(record => record.find(record => record.id === id));
  }
}
