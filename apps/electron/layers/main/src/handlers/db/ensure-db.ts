import type { watch } from '@affine/native';
import type { NotifyEvent } from '@affine/native/event';
import { app } from 'electron';
import {
  from,
  fromEvent,
  identity,
  lastValueFrom,
  NEVER,
  Observable,
  ReplaySubject,
} from 'rxjs';
import {
  debounceTime,
  distinctUntilChanged,
  exhaustMap,
  filter,
  groupBy,
  ignoreElements,
  map,
  mergeMap,
  shareReplay,
  startWith,
  take,
  takeUntil,
  tap,
} from 'rxjs/operators';

import { appContext } from '../../context';
import { subjects } from '../../events';
import { logger } from '../../logger';
import { ts } from '../../utils';
import { openWorkspaceDatabase, WorkspaceSQLiteDB } from './sqlite';

export const databaseInput$ = new ReplaySubject<string>();
const terminate$ = app ? fromEvent(app, 'before-quit') : NEVER;

export const database$ = databaseInput$.pipe(
  distinctUntilChanged(),
  filter(
    workspaceId => !WorkspaceSQLiteDB.destroyedWorkspaces.has(workspaceId)
  ),
  groupBy(identity),
  mergeMap(workspaceDatabase$ =>
    workspaceDatabase$.pipe(
      // only open the first db with the same workspaceId, and emit it to the downstream
      exhaustMap(workspaceId => {
        logger.info('[ensureSQLiteDB] open db connection', workspaceId);
        return from(openWorkspaceDatabase(appContext, workspaceId)).pipe(
          exhaustMap(db =>
            startWatchingDBFile(db).pipe(
              map(() => db),
              // ignore all events and only emit the db to the downstream
              ignoreElements(),
              startWith(db)
            )
          )
        );
      }),
      shareReplay(Number.MAX_SAFE_INTEGER)
    )
  ),
  takeUntil(terminate$)
);

// if we removed the file, we will stop watching it
function startWatchingDBFile(db: WorkspaceSQLiteDB) {
  // require it in the function so that it won't break the `generate-main-exposed-meta.mjs`
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fsWatch: typeof watch = require('@affine/native').watch;
  return new Observable<NotifyEvent>(subscriber => {
    const subscription = fsWatch(db.path).subscribe(
      event => {
        subscriber.next(event);
        if (typeof event.type === 'object' && 'remove' in event.type) {
          subscriber.complete();
        }
      },
      err => {
        subscriber.error(err);
      }
    );
    return () => {
      subscription.unsubscribe();
    };
  }).pipe(
    filter(() => ts() - db.lastUpdateTime > 100),
    debounceTime(1000),
    tap({
      next: () => {
        logger.info(
          'db file changed on disk',
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
        logger.info('db file missing', db.workspaceId);
        subjects.db.dbFileMissing.next(db.workspaceId);
        db.destroy();
      },
    })
  );
}

export function ensureSQLiteDB(id: string) {
  WorkspaceSQLiteDB.destroyedWorkspaces.delete(id);
  databaseInput$.next(id);
  return lastValueFrom(
    database$.pipe(
      filter(db => db.workspaceId === id && db.db.open),
      take(1)
    )
  );
}
