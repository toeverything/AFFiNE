import { Subject } from 'rxjs';

import type { MainEventListener } from './type';

export const dbSubjects = {
  // emit workspace ids
  dbFileMissing: new Subject<string>(),
  // emit workspace ids
  dbFileUpdate: new Subject<string>(),
};

export const dbEvents = {
  onDbFileMissing: (fn: (workspaceId: string) => void) => {
    const sub = dbSubjects.dbFileMissing.subscribe(fn);

    return () => {
      sub.unsubscribe();
    };
  },
  onDbFileUpdate: (fn: (workspaceId: string) => void) => {
    const sub = dbSubjects.dbFileUpdate.subscribe(fn);
    return () => {
      sub.unsubscribe();
    };
  },
} satisfies Record<string, MainEventListener>;
