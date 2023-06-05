import { app } from 'electron';
import type { Observable } from 'rxjs';
import {
  concat,
  defer,
  from,
  fromEvent,
  interval,
  lastValueFrom,
  merge,
} from 'rxjs';
import {
  concatMap,
  distinctUntilChanged,
  filter,
  ignoreElements,
  last,
  map,
  mergeMap,
  shareReplay,
  startWith,
  switchMap,
  take,
  takeUntil,
  tap,
} from 'rxjs/operators';

import { appContext } from '../context';
import { logger } from '../logger';
import { getWorkspaceMeta, workspaceSubjects } from '../workspace';
import { SecondaryWorkspaceSQLiteDB } from './secondary-db';
import type { WorkspaceSQLiteDB } from './workspace-db-adapter';
import { openWorkspaceDatabase } from './workspace-db-adapter';

const db$Map = new Map<string, Observable<WorkspaceSQLiteDB>>();

// use defer to prevent `app` is undefined while running tests
const beforeQuit$ = defer(() => fromEvent(app, 'before-quit'));

function getWorkspaceDB$(id: string) {
  if (!db$Map.has(id)) {
    db$Map.set(
      id,
      from(openWorkspaceDatabase(appContext, id)).pipe(
        tap({
          next: db => {
            logger.info(
              '[ensureSQLiteDB] db connection established',
              db.workspaceId
            );
          },
        }),
        switchMap(db =>
          // takeUntil the polling stream, and then destroy the db
          concat(
            startPollingSecondaryDB(db).pipe(
              ignoreElements(),
              startWith(db),
              takeUntil(beforeQuit$),
              last()
            ),
            defer(() => {
              return db
                .destroy()
                .then(() => {
                  db$Map.delete(id);
                  return db;
                })
                .catch(err => {
                  logger.error('[ensureSQLiteDB] destroy db failed', err);
                  throw err;
                });
            })
          ).pipe(startWith(db))
        ),
        shareReplay(1)
      )
    );
  }
  return db$Map.get(id)!;
}

function startPollingSecondaryDB(db: WorkspaceSQLiteDB) {
  return merge(
    interval(30000).pipe(
      startWith(0),
      switchMap(() => getWorkspaceMeta(appContext, db.workspaceId))
    ),
    workspaceSubjects.meta.pipe(
      map(({ meta }) => meta),
      filter(meta => meta.id === db.workspaceId)
    )
  ).pipe(
    map(meta => meta?.secondaryDBPath),
    filter((p): p is string => !!p),
    distinctUntilChanged(),
    concatMap(path => {
      const secondaryDB = new SecondaryWorkspaceSQLiteDB(path, db);
      return from(secondaryDB.connectIfNeeded()).pipe(
        mergeMap(() =>
          // use concat to make sure the db.destroy is running after the `secondaryDBPath` is changed
          concat(
            db.update$.pipe(
              mergeMap(async () => {
                try {
                  secondaryDB.pull();
                } catch (err) {
                  logger.error(`[PollingSecondaryDB] pull error`, err);
                }
                return secondaryDB;
              }),
              takeUntil(
                merge(
                  beforeQuit$,
                  workspaceSubjects.meta.pipe(
                    filter(
                      ({ meta }) =>
                        meta.id === db.workspaceId &&
                        meta.secondaryDBPath !== path
                    ),
                    tap({
                      next: meta => {
                        logger.info(`[PollingSecondaryDB] meta update`, meta);
                      },
                    })
                  )
                )
              )
            ),
            defer(() => {
              logger.info(
                '[ensureSQLiteDB] close secondary db connection',
                secondaryDB.path
              );
              return secondaryDB.destroy();
            })
          )
        )
      );
    }),
    tap({
      error: err => {
        logger.error(`[ensureSQLiteDB] polling secondary db error`, err);
      },
      complete: () => {
        logger.info('[ensureSQLiteDB] polling secondary db complete');
      },
    })
  );
}

export function ensureSQLiteDB(id: string) {
  return lastValueFrom(getWorkspaceDB$(id).pipe(take(1)));
}
