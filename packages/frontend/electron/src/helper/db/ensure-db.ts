import type { Subject } from 'rxjs';
import { defer, from, fromEvent, lastValueFrom, merge, Observable } from 'rxjs';
import { shareReplay, tap } from 'rxjs/operators';

import { logger } from '../logger';
import type { WorkspaceSQLiteDB } from './workspace-db-adapter';
import { openWorkspaceDatabase } from './workspace-db-adapter';

// export for testing
export const db$Map = new Map<string, Observable<WorkspaceSQLiteDB>>();

// use defer to prevent `app` is undefined while running tests
const beforeQuit$ = defer(() => fromEvent(process, 'beforeExit'));

// return a stream that emit a single event when the subject completes
function completed<T>(subject$: Subject<T>) {
  return new Observable(subscriber => {
    const sub = subject$.subscribe({
      complete: () => {
        subscriber.next();
        subscriber.complete();
      },
    });
    return () => sub.unsubscribe();
  });
}

function getWorkspaceDB(id: string) {
  if (!db$Map.has(id)) {
    db$Map.set(
      id,
      from(openWorkspaceDatabase(id)).pipe(
        tap({
          next: db => {
            logger.info(
              '[ensureSQLiteDB] db connection established',
              db.workspaceId
            );
            merge(beforeQuit$, completed(db.update$)).subscribe(() => {
              db.destroy()
                .then(() => {
                  logger.info(
                    '[ensureSQLiteDB] db connection closed',
                    db.workspaceId
                  );
                })
                .catch(err => {
                  logger.error('[ensureSQLiteDB] destroy db failed', err);
                });
            });
          },
        }),
        shareReplay(1)
      )
    );
  }
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return db$Map.get(id)!;
}

export function ensureSQLiteDB(id: string) {
  return lastValueFrom(getWorkspaceDB(id));
}
