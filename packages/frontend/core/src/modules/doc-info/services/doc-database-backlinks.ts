import {
  DatabaseBlockDataSource,
  type DatabaseBlockModel,
} from '@blocksuite/affine/blocks';
import type { DocsService } from '@toeverything/infra';
import { Service } from '@toeverything/infra';
import { combineLatest, map, Observable, switchMap } from 'rxjs';

import type { Backlink } from '../../doc-link';
import type { DocsSearchService } from '../../docs-search';
import type { DatabaseRow, DatabaseValueCell } from '../types';
import { signalToObservable } from '../utils';

export class DocDatabaseBacklinksService extends Service {
  constructor(
    private readonly docsService: DocsService,
    private readonly docsSearchService: DocsSearchService
  ) {
    super();
  }

  private async ensureDocLoaded(docId: string) {
    const docRef = this.docsService.open(docId);
    if (!docRef.doc.blockSuiteDoc.ready) {
      docRef.doc.blockSuiteDoc.load();
    }
    docRef.doc.setPriorityLoad(10);
    await docRef.doc.waitForSyncReady();
    return docRef;
  }

  private watchRowCells$(dbModel: DatabaseBlockModel, rowId: string) {
    const dataSource = new DatabaseBlockDataSource(dbModel);

    console.log('watchRowCells$', dataSource.propertyMetas);

    const hydratedRows$ = combineLatest([
      signalToObservable(dataSource.rows$),
      signalToObservable(dataSource.properties$),
    ]).pipe(
      map(([rowIds, propertyIds]) => {
        const rowExists = rowIds.some(id => id === rowId);
        if (!rowExists) {
          return undefined;
        }
        return propertyIds
          .map<DatabaseValueCell | undefined>(id => {
            const type = dataSource.propertyTypeGet(id);
            return {
              value: dataSource.cellValueGet(rowId, id),
              property: {
                id,
                type,
                name: dataSource.propertyNameGet(id),
                additionalData: dataSource.propertyDataGet(id),
              },
            };
          })
          .filter((p: any): p is DatabaseValueCell => !!p)
          .toSorted((a, b) =>
            (a.property.name ?? '').localeCompare(b.property.name ?? '')
          );
      })
    );

    return [hydratedRows$, dataSource] as const;
  }

  // for each backlink,
  // 1. check if it is in a database block
  // 2. if it is, return the related database row
  // 3. if it is not, return undefined
  private watchDatabaseRow$(backlink: Backlink) {
    return new Observable<DatabaseRow | undefined>(subscriber => {
      let disposed = false;
      let unsubscribe = () => {};
      const docRef = this.docsService.open(backlink.docId);
      const run = async () => {
        await this.ensureDocLoaded(backlink.docId);
        if (disposed) {
          return;
        }
        const block = docRef.doc.blockSuiteDoc.getBlock(backlink.blockId);
        const parent = block?.model.parent;
        if (parent?.flavour === 'affine:database') {
          const dbModel = parent as DatabaseBlockModel;
          const [cells$, dataSource] = this.watchRowCells$(
            dbModel,
            backlink.blockId
          );
          const subscription = cells$.subscribe(cells => {
            if (cells) {
              subscriber.next({
                cells,
                id: backlink.blockId,
                doc: docRef.doc,
                docId: backlink.docId,
                databaseId: dbModel.id,
                databaseName: dbModel.title.yText.toString(),
                dataSource: dataSource,
              });
            } else {
              subscriber.next(undefined);
            }
          });
          unsubscribe = () => subscription.unsubscribe();
        }
      };

      run().catch(e => {
        console.error(`failed to get database info:`, e);
        docRef.release();
      });

      return () => {
        docRef.release();
        disposed = true;
        unsubscribe();
      };
    });
  }

  // backlinks (docid:blockid) -> related db rows (DatabaseRow[])
  watchDbBacklinkRows$(docId: string) {
    return this.docsSearchService.watchRefsTo(docId).pipe(
      switchMap(backlinks => {
        return combineLatest(
          backlinks.map(backlink => {
            return this.watchDatabaseRow$(backlink);
          })
        );
      }),
      map(rows => rows.filter((row): row is DatabaseRow => Boolean(row)))
    );
  }
}
