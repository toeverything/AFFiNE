import { app } from 'electron';
import {
  connectable,
  defer,
  from,
  fromEvent,
  identity,
  interval,
  lastValueFrom,
  Observable,
  race,
  ReplaySubject,
  Subject,
} from 'rxjs';
import {
  distinctUntilChanged,
  filter,
  groupBy,
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
import { getWorkspaceMeta$ } from '../workspace';
import { SecondaryWorkspaceSQLiteDB } from './secondary-db';
import type { WorkspaceSQLiteDB } from './workspace-db-adapter';
import { openWorkspaceDatabase } from './workspace-db-adapter';

const databaseInput$ = new Subject<string>();
const databaseConnector$ = new ReplaySubject<WorkspaceSQLiteDB>();
const groupedIDs$ = databaseInput$.pipe(groupBy(identity));

const database$ = connectable(
  groupedIDs$.pipe(
    mergeMap(id$ =>
      id$.pipe(
        switchMap(workspaceId => {
          logger.info('[ensureSQLiteDB] open db connection', workspaceId);
          return from(openWorkspaceDatabase(appContext, workspaceId)).pipe(
            switchMap(db => {
              return startPollingSecondaryDB(db).pipe(
                ignoreElements(),
                startWith(db),
                tap({
                  complete: () => {
                    logger.info('[ensureSQLiteDB] close db connection');
                    db.destroy();
                  },
                })
              );
            })
          );
        }),
        shareReplay(1)
      )
    )
  ),
  {
    connector: () => databaseConnector$,
    resetOnDisconnect: true,
  }
);

app.on('ready', () => {
  const databaseConnectableSubscription = database$.connect();
  app.on('before-quit', () => {
    databaseConnectableSubscription.unsubscribe();
  });
});

// fixme: this function has issue on registering multiple times...
function startPollingSecondaryDB(db: WorkspaceSQLiteDB) {
  const meta$ = getWorkspaceMeta$(db.workspaceId);
  const secondaryDB$ = meta$.pipe(
    map(meta => meta?.secondaryDBPath),
    distinctUntilChanged(),
    filter((p): p is string => !!p),
    switchMap(path => {
      return new Observable<SecondaryWorkspaceSQLiteDB>(observer => {
        const secondaryDB = new SecondaryWorkspaceSQLiteDB(path, db);
        observer.next(secondaryDB);
        return () => {
          secondaryDB.destroy();
        };
      });
    }),
    shareReplay(1)
  );

  // pull every 30 seconds
  const poll$ = interval(30000).pipe(
    startWith(0),
    switchMap(() => secondaryDB$),
    tap({
      next: secondaryDB => {
        secondaryDB.pull();
      },
    }),
    shareReplay(1)
  );

  // note: both push and pull have side effects
  return poll$.pipe(
    takeUntil(
      race(
        db.update$.pipe(last()),
        defer(() => fromEvent(app, 'before-quit'))
      )
    )
  );
}

export function ensureSQLiteDB(id: string) {
  const deferValue = lastValueFrom(
    database$.pipe(
      // only open the first db with the same workspaceId, and emit it to the downstream
      filter(db => {
        return db.db !== null && db.workspaceId === id && db.db.open;
      }),
      take(1),
      tap({
        error: err => {
          logger.error('[ensureSQLiteDB] error', err);
        },
      })
    )
  );
  databaseInput$.next(id);
  return deferValue;
}
