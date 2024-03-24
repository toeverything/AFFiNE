import { isEqual } from 'lodash-es';
import { distinctUntilChanged, map, Observable } from 'rxjs';

import { LiveData } from '../livedata';
import { type Workspace, type WorkspaceLocalState } from '../workspace';
import { PageRecord } from './record';

export class PageRecordList {
  constructor(
    private readonly workspace: Workspace,
    private readonly localState: WorkspaceLocalState
  ) {}

  public readonly records$ = LiveData.from<PageRecord[]>(
    new Observable<string[]>(subscriber => {
      const emit = () => {
        subscriber.next(
          this.workspace.docCollection.meta.docMetas.map(v => v.id)
        );
      };

      emit();

      const dispose =
        this.workspace.docCollection.meta.docMetaUpdated.on(emit).dispose;
      return () => {
        dispose();
      };
    }).pipe(
      distinctUntilChanged((p, c) => isEqual(p, c)),
      map(ids =>
        ids.map(id => new PageRecord(id, this.workspace, this.localState))
      )
    ),
    []
  );

  public readonly isReady$ = this.workspace.engine.rootDocState$.map(
    state => !state.syncing
  );

  public record$(id: string) {
    return this.records$.map(record => record.find(record => record.id === id));
  }
}
