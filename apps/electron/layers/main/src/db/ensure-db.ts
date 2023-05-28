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
        switchMap(db => {
          return startPollingSecondaryDB(db).pipe(
            ignoreElements(),
            startWith(db),
            takeUntil(beforeQuit$),
            tap({
              complete: () => {
                logger.info('[ensureSQLiteDB] close db connection');
                db.destroy();
                db$Map.delete(id);
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

// fixme: this function has issue on registering multiple times...
function startPollingSecondaryDB(db: WorkspaceSQLiteDB) {
  const meta$ = getWorkspaceMeta$(db.workspaceId);
  const secondaryDB$ = meta$.pipe(
    map(meta => meta?.secondaryDBPath),
    distinctUntilChanged(),
    filter((p): p is string => !!p),
    switchMap(path => {
      const secondaryDB = new SecondaryWorkspaceSQLiteDB(path, db);
      return new Observable<SecondaryWorkspaceSQLiteDB>(observer => {
        observer.next(secondaryDB);
        return () => {
          secondaryDB.destroy();
        };
      });
    })
  );

  // pull every 30 seconds
  const poll$ = interval(30000).pipe(
    switchMap(() => secondaryDB$),
    tap({
      next: secondaryDB => {
        secondaryDB.pull();
      },
    }),
    shareReplay(1)
  );

  return poll$.pipe(takeUntil(db.update$.pipe(last())), shareReplay(1));
}

export function ensureSQLiteDB(id: string) {
  return firstValueFrom(getWorkspaceDB$(id));
}
