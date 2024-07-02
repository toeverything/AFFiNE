import { map } from 'rxjs';

import { Entity } from '../../../framework';
import { LiveData } from '../../../livedata';
import type { DocsStore } from '../stores/docs';
import { type DocMode, DocRecord } from './record';

export class DocRecordList extends Entity {
  constructor(private readonly store: DocsStore) {
    super();
  }

  private readonly pool = new Map<string, DocRecord>();

  public readonly docs$ = LiveData.from<DocRecord[]>(
    this.store.watchDocIds().pipe(
      map(ids =>
        ids.map(id => {
          const exists = this.pool.get(id);
          if (exists) {
            return exists;
          }
          const record = this.framework.createEntity(DocRecord, { id });
          this.pool.set(id, record);
          return record;
        })
      )
    ),
    []
  );

  public readonly trashDocs$ = LiveData.from<DocRecord[]>(
    this.store.watchTrashDocIds().pipe(
      map(ids =>
        ids.map(id => {
          const exists = this.pool.get(id);
          if (exists) {
            return exists;
          }
          const record = this.framework.createEntity(DocRecord, { id });
          this.pool.set(id, record);
          return record;
        })
      )
    ),
    []
  );

  public readonly isReady$ = LiveData.from(
    this.store.watchDocListReady(),
    false
  );

  public doc$(id: string) {
    return this.docs$.map(record => record.find(record => record.id === id));
  }

  public setMode(id: string, mode: DocMode) {
    return this.store.setDocModeSetting(id, mode);
  }

  public getMode(id: string) {
    return this.store.getDocModeSetting(id);
  }

  public toggleMode(id: string) {
    const mode = this.getMode(id) === 'edgeless' ? 'page' : 'edgeless';
    this.setMode(id, mode);
    return this.getMode(id);
  }

  public observeMode(id: string) {
    return this.store.watchDocModeSetting(id);
  }
}
