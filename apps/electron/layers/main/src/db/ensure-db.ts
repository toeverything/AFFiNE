import type { NotifyEvent } from '@affine/native/event';
import { app } from 'electron';
import {
  connectable,
  defer,
  from,
  fromEvent,
  identity,
  interval,
  lastValueFrom,
  merge,
  race,
  ReplaySubject,
  Subject,
} from 'rxjs';
import {
  debounceTime,
  distinctUntilChanged,
  exhaustMap,
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
export const databaseConnector$ = new ReplaySubject<WorkspaceSQLiteDB>();

const groupedIDs$ = databaseInput$.pipe(groupBy(identity));

export const database$ = connectable(
  groupedIDs$.pipe(
    mergeMap(id$ =>
      id$.pipe(
        // only open the first db with the same workspaceId, and emit it to the downstream
        exhaustMap(workspaceId => {
          logger.info('[ensureSQLiteDB] open db connection', workspaceId);
          return from(openWorkspaceDatabase(appContext, workspaceId)).pipe(
            switchMap(db => {
              return startPollingSecondaryDB(db).pipe(
                ignoreElements(),
                startWith(db)
              );
            })
          );
        }),
        // close DB when app-quit
        shareReplay(1)
      )
    )
  ),
  {
    connector: () => databaseConnector$,
    resetOnDisconnect: true,
  }
);

export const databaseConnectableSubscription = database$.connect();

// 1. File delete
// 2. File move
//   - on Linux, it's `type: { modify: { kind: 'rename', mode: 'from' } }`
//   - on Windows, it's `type: { remove: { kind: 'any' } }`
//   - on macOS, it's `type: { modify: { kind: 'rename', mode: 'any' } }`
export function isRemoveOrMoveEvent(event: NotifyEvent) {
  return (
    typeof event.type === 'object' &&
    ('remove' in event.type ||
      ('modify' in event.type &&
        event.type.modify.kind === 'rename' &&
        (event.type.modify.mode === 'from' ||
          event.type.modify.mode === 'any')))
  );
}

function startPollingSecondaryDB(db: WorkspaceSQLiteDB) {
  const meta$ = getWorkspaceMeta$(db.workspaceId);
  const secondaryDB$ = meta$.pipe(
    map(meta => meta?.secondaryDBPath),
    distinctUntilChanged(),
    filter((p): p is string => !!p),
    map(path => new SecondaryWorkspaceSQLiteDB(path, db)),
    shareReplay(1)
  );

  // push every 5 seconds (debounce db.update$)
  const push$ = db.update$.pipe(debounceTime(5000)).pipe(
    switchMap(() => secondaryDB$),
    switchMap(db => from(db.push()))
  );

  // pull every 10 seconds
  const pull$ = interval(10000)
    .pipe(switchMap(() => secondaryDB$))
    .pipe(switchMap(db => from(db.pull())));

  return merge(push$, pull$).pipe(
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
      filter(db => db.db !== null && db.workspaceId === id && db.db.open),
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
