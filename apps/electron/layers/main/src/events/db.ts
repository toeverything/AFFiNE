import { Subject } from 'rxjs';

import type { MainEventListener } from './type';

interface DBFilePathMeta {
  workspaceId: string;
  path: string;
  realPath: string;
}

export const dbSubjects = {
  // emit workspace ids
  dbFileMissing: new Subject<string>(),
  // emit workspace ids
  dbFileUpdate: new Subject<string>(),
  dbFilePathChange: new Subject<DBFilePathMeta>(),
};

export const dbEvents = {
  onDBFileMissing: (fn: (workspaceId: string) => void) => {
    const sub = dbSubjects.dbFileMissing.subscribe(fn);
    return () => {
      sub.unsubscribe();
    };
  },
  onDBFileUpdate: (fn: (workspaceId: string) => void) => {
    const sub = dbSubjects.dbFileUpdate.subscribe(fn);
    return () => {
      sub.unsubscribe();
    };
  },
  onDBFilePathChange: (fn: (meta: DBFilePathMeta) => void) => {
    const sub = dbSubjects.dbFilePathChange.subscribe(fn);
    return () => {
      sub.unsubscribe();
    };
  },
} satisfies Record<string, MainEventListener>;
