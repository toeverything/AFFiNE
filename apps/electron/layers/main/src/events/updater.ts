import { Subject } from 'rxjs';

import type { MainEventListener } from './type';

interface UpdateMeta {
  version: string;
}

export const updaterSubjects = {
  // means it is ready for restart and install the new version
  clientUpdateReady: new Subject<UpdateMeta>(),
};

export const updaterEvents = {
  onClientUpdateReady: (fn: (versionMeta: UpdateMeta) => void) => {
    const sub = updaterSubjects.clientUpdateReady.subscribe(fn);
    return () => {
      sub.unsubscribe();
    };
  },
} satisfies Record<string, MainEventListener>;
