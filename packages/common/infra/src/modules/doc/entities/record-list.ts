import type { DocMode } from '@blocksuite/affine/blocks';
import { map } from 'rxjs';

import { Entity } from '../../../framework';
import { LiveData } from '../../../livedata';
import type { DocsStore } from '../stores/docs';
import { DocRecord } from './record';

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

  public setPrimaryMode(id: string, mode: DocMode) {
    return this.store.setDocPrimaryModeSetting(id, mode);
  }

  public getPrimaryMode(id: string) {
    return this.store.getDocPrimaryModeSetting(id);
  }

  public togglePrimaryMode(id: string) {
    const mode = (
      this.getPrimaryMode(id) === 'edgeless' ? 'page' : 'edgeless'
    ) as DocMode;
    this.setPrimaryMode(id, mode);
    return this.getPrimaryMode(id);
  }

  public primaryMode$(id: string) {
    return LiveData.from(
      this.store.watchDocPrimaryModeSetting(id),
      this.getPrimaryMode(id)
    );
  }
}
