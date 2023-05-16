import type { NotifyEvent } from '@affine/native/event';
import { createFSWatcher } from '@affine/native/fs-watcher';
import { app } from 'electron';
import {
  connectable,
  defer,
  from,
  fromEvent,
  identity,
  lastValueFrom,
  Observable,
  ReplaySubject,
  Subject,
} from 'rxjs';
import {
  debounceTime,
  exhaustMap,
  filter,
  groupBy,
  ignoreElements,
  mergeMap,
  shareReplay,
  startWith,
  switchMap,
  take,
  takeUntil,
  tap,
} from 'rxjs/operators';

import { appContext } from '../../context';
import { subjects } from '../../events';
import { logger } from '../../logger';
import { ts } from '../../utils';
import type { WorkspaceSQLiteDB } from './sqlite';
import { openWorkspaceDatabase } from './sqlite';

const databaseInput$ = new Subject<string>();
export const databaseConnector$ = new ReplaySubject<WorkspaceSQLiteDB>();

const groupedDatabaseInput$ = databaseInput$.pipe(groupBy(identity));

export const database$ = connectable(
  groupedDatabaseInput$.pipe(
    mergeMap(workspaceDatabase$ =>
      workspaceDatabase$.pipe(
        // only open the first db with the same workspaceId, and emit it to the downstream
        exhaustMap(workspaceId => {
          logger.info('[ensureSQLiteDB] open db connection', workspaceId);
          return from(openWorkspaceDatabase(appContext, workspaceId)).pipe(
            switchMap(db => {
              return startWatchingDBFile(db).pipe(
                // ignore all events and only emit the db to the downstream
                ignoreElements(),
                startWith(db)
              );
            })
          );
        }),
        shareReplay(1)
      )
    ),
    tap({
      complete: () => {
        logger.info('[FSWatcher] close all watchers');
        createFSWatcher().close();
      },
    })
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

// if we removed the file, we will stop watching it
function startWatchingDBFile(db: WorkspaceSQLiteDB) {
  const FSWatcher = createFSWatcher();
  return new Observable<NotifyEvent>(subscriber => {
    logger.info('[FSWatcher] start watching db file', db.workspaceId);
    const subscription = FSWatcher.watch(db.path, {
      recursive: false,
    }).subscribe(
      event => {
        logger.info('[FSWatcher]', event);
        subscriber.next(event);
        // remove file or move file, complete the observable and close db
        if (isRemoveOrMoveEvent(event)) {
          subscriber.complete();
        }
      },
      err => {
        subscriber.error(err);
      }
    );
    return () => {
      // destroy on unsubscribe
      logger.info('[FSWatcher] cleanup db file watcher', db.workspaceId);
      db.destroy();
      subscription.unsubscribe();
    };
  }).pipe(
    debounceTime(1000),
    filter(event => !isRemoveOrMoveEvent(event)),
    tap({
      next: () => {
        logger.info(
          '[FSWatcher] db file changed on disk',
          db.workspaceId,
          ts() - db.lastUpdateTime,
          'ms'
        );
        db.reconnectDB();
        subjects.db.dbFileUpdate.next(db.workspaceId);
      },
      complete: () => {
        // todo: there is still a possibility that the file is deleted
        // but we didn't get the event soon enough and another event tries to
        // access the db
        logger.info('[FSWatcher] db file missing', db.workspaceId);
        subjects.db.dbFileMissing.next(db.workspaceId);
        db.destroy();
      },
    }),
    takeUntil(defer(() => fromEvent(app, 'before-quit')))
  );
}

export function ensureSQLiteDB(id: string) {
  const deferValue = lastValueFrom(
    database$.pipe(
      filter(db => db.workspaceId === id && db.db.open),
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
