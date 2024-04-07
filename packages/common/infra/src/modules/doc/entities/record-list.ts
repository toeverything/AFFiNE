import { map } from 'rxjs';

import { Entity } from '../../../framework';
import { LiveData } from '../../../livedata';
import type { DocsStoreService } from '../services/docs-store';
import { DocRecord } from './record';

export class DocRecordList extends Entity {
  constructor(private readonly store: DocsStoreService) {
    super();
  }

  private readonly recordsPool = new Map<string, DocRecord>();

  public readonly records$ = LiveData.from<DocRecord[]>(
    this.store.watchDocIds().pipe(
      map(ids =>
        ids.map(id => {
          const exists = this.recordsPool.get(id);
          if (exists) {
            return exists;
          }
          const record = this.framework.createEntity(DocRecord, { id });
          this.recordsPool.set(id, record);
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

  public record$(id: string) {
    return this.records$.map(record => record.find(record => record.id === id));
  }
}
