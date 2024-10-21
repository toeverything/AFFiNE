import {
  DatabaseBlockDataSource,
  type DatabaseBlockModel,
} from '@blocksuite/affine/blocks';
import type { DocsService } from '@toeverything/infra';
import { Service } from '@toeverything/infra';
import { isEqual } from 'lodash-es';
import {
  combineLatest,
  distinctUntilChanged,
  map,
  Observable,
  switchMap,
} from 'rxjs';

import type { Backlink } from '../../doc-link';
import type { DocsSearchService } from '../../docs-search';
import type { DatabaseRow, DatabaseValueCell } from '../types';
import { signalToLiveData, signalToObservable } from '../utils';

const equalComparator = <T>(a: T, b: T) => {
  return isEqual(a, b);
};

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

  private adaptRowCells(dbModel: DatabaseBlockModel, rowId: string) {
    const dataSource = new DatabaseBlockDataSource(dbModel);

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
          .map<DatabaseValueCell>(id => {
            return {
              id,
              value$: signalToLiveData(
                dataSource.cellValueGet$(rowId, id)
              ).distinctUntilChanged(equalComparator),
              property: {
                id,
                type$: signalToLiveData(dataSource.propertyTypeGet$(id)),
                name$: signalToLiveData(dataSource.propertyNameGet$(id)),
                data$: signalToLiveData(dataSource.propertyDataGet$(id)),
              },
            };
          })
          .filter((p: any): p is DatabaseValueCell => !!p);
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
          const [cells$, dataSource] = this.adaptRowCells(
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
        } else {
          subscriber.next(undefined);
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
  // todo: use LiveData per-CELL, instead of using a single LiveData for all rows
  watchDbBacklinkRows$(docId: string) {
    return this.docsSearchService.watchRefsTo(docId).pipe(
      distinctUntilChanged(equalComparator),
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
