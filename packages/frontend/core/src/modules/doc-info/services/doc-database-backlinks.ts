import { DatabaseBlockDataSource } from '@blocksuite/affine/blocks/database';
import type { DatabaseBlockModel } from '@blocksuite/affine/model';
import { LiveData, Service } from '@toeverything/infra';
import { isEqual } from 'lodash-es';
import { combineLatest, distinctUntilChanged, map, Observable } from 'rxjs';

import type { DocsService } from '../../doc';
import type { DocsSearchService } from '../../docs-search';
import type { DatabaseRow, DatabaseValueCell } from '../types';
import { signalToObservable } from '../utils';

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
    const disposePriorityLoad = docRef.doc.addPriorityLoad(10);
    await docRef.doc.waitForSyncReady();
    disposePriorityLoad();
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
              value$: LiveData.fromSignal(
                dataSource.cellValueGet$(rowId, id)
              ).distinctUntilChanged(equalComparator),
              property: {
                id,
                type$: LiveData.fromSignal(dataSource.propertyTypeGet$(id)),
                name$: LiveData.fromSignal(dataSource.propertyNameGet$(id)),
                data$: LiveData.fromSignal(dataSource.propertyDataGet$(id)),
              },
            };
          })
          .filter((p: any): p is DatabaseValueCell => !!p);
      })
    );

    return [hydratedRows$, dataSource] as const;
  }

  // for each db doc backlink,
  private watchDatabaseRow$(backlink: {
    docId: string;
    rowId: string;
    databaseBlockId: string;
  }) {
    return new Observable<DatabaseRow | undefined>(subscriber => {
      let disposed = false;
      let unsubscribe = () => {};
      const docRef = this.docsService.open(backlink.docId);
      const run = async () => {
        await this.ensureDocLoaded(backlink.docId);
        if (disposed) {
          return;
        }
        const maybeDatabaseBlock = docRef.doc.blockSuiteDoc.getBlock(
          backlink.databaseBlockId
        );
        if (maybeDatabaseBlock?.flavour === 'affine:database') {
          const dbModel = maybeDatabaseBlock.model as DatabaseBlockModel;
          const [cells$, dataSource] = this.adaptRowCells(
            dbModel,
            backlink.rowId
          );
          const subscription = cells$.subscribe(cells => {
            if (cells) {
              subscriber.next({
                cells,
                id: backlink.rowId,
                doc: docRef.doc,
                docId: backlink.docId,
                databaseId: dbModel.id,
                databaseName: dbModel.props.title.yText.toString(),
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

  // backlinks (docid:blockid:databaseBlockId)
  //   -> related db rows (DatabaseRow[])
  watchDbBacklinkRows$(
    docId: string,
    defaultItems?: {
      docId: string;
      databaseBlockId: string;
      rowId: string;
    }[]
  ) {
    return this.docsSearchService.watchDatabasesTo(docId).pipe(
      distinctUntilChanged(equalComparator),
      map(rows =>
        rows.toSorted(
          (a, b) => a.databaseName?.localeCompare(b.databaseName ?? '') ?? 0
        )
      ),
      map(backlinks => {
        // merge default items with backlinks in indexer
        const merged = [...(defaultItems ?? [])];

        backlinks.forEach(backlink => {
          // if the backlink is already in the merged list, skip it
          if (
            merged.some(
              item =>
                item.databaseBlockId === backlink.databaseBlockId &&
                item.rowId === backlink.rowId &&
                item.docId === backlink.docId
            )
          ) {
            return;
          }
          merged.push(backlink);
        });

        return merged.map(backlink => {
          return {
            ...backlink,
            row$: this.watchDatabaseRow$(backlink),
          };
        });
      })
    );
  }
}
