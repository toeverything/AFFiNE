import { app } from 'electron';
import {
  defer,
  firstValueFrom,
  from,
  fromEvent,
  interval,
  Observable,
} from 'rxjs';
import {
  distinctUntilChanged,
  filter,
  ignoreElements,
  last,
  map,
  shareReplay,
  startWith,
  switchMap,
  takeUntil,
  tap,
} from 'rxjs/operators';

import { appContext } from '../context';
import { logger } from '../logger';
import { getWorkspaceMeta$ } from '../workspace';
import { SecondaryWorkspaceSQLiteDB } from './secondary-db';
import type { WorkspaceSQLiteDB } from './workspace-db-adapter';
import { openWorkspaceDatabase } from './workspace-db-adapter';

const db$Map = new Map<string, Observable<WorkspaceSQLiteDB>>();

const beforeQuit$ = defer(() => fromEvent(app, 'before-quit'));

function getWorkspaceDB$(id: string) {
  if (!db$Map.has(id)) {
    db$Map.set(
      id,
      from(openWorkspaceDatabase(appContext, id)).pipe(
        shareReplay(1),
        switchMap(db => {
          return startPollingSecondaryDB(db).pipe(
            ignoreElements(),
            startWith(db),
            takeUntil(beforeQuit$),
            tap({
              complete: () => {
                logger.info('[ensureSQLiteDB] close db connection');
                db$Map.delete(id);
                db.destroy().catch(err => {
                  logger.error('[ensureSQLiteDB] destroy db failed', err);
                });
              },
            })
          );
        }),
        shareReplay(1)
      )
    );
  }
  return db$Map.get(id)!;
}

function startPollingSecondaryDB(db: WorkspaceSQLiteDB) {
  // pull every 30 seconds
  const poll$ = interval(30000).pipe(
    startWith(0),
    switchMap(() => {
      return getWorkspaceMeta$(db.workspaceId).pipe(
        map(meta => meta?.secondaryDBPath),
        distinctUntilChanged(),
        filter((p): p is string => !!p),
        switchMap(path => {
          return new Observable<SecondaryWorkspaceSQLiteDB>(observer => {
            const secondaryDB = new SecondaryWorkspaceSQLiteDB(path, db);
            secondaryDB
              .connect()
              .then(() => secondaryDB.pull())
              .then(() => {
                observer.next(secondaryDB);
              })
              .catch(err => {
                observer.error(err);
              });
            return () => {
              logger.info(
                '[ensureSQLiteDB] close secondary db connection',
                secondaryDB.path
              );
              return secondaryDB.destroy();
            };
          });
        })
      );
    }),
    takeUntil(db.update$.pipe(last())),
    shareReplay(1),
    tap({
      error: err => {
        logger.error(err);
      },
    })
  );

  return poll$;
}

export function ensureSQLiteDB(id: string) {
  return firstValueFrom(getWorkspaceDB$(id));
}
