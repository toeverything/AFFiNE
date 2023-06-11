import { BehaviorSubject, Subject } from 'rxjs';

import type { MainEventRegister } from '../type';

export interface UpdateMeta {
  version: string;
  allowAutoUpdate: boolean;
}

export const updaterSubjects = {
  // means it is ready for restart and install the new version
  updateAvailable: new Subject<UpdateMeta>(),
  updateReady: new Subject<UpdateMeta>(),
  downloadProgress: new BehaviorSubject<number>(0),
};

export const updaterEvents = {
  onUpdateAvailable: (fn: (versionMeta: UpdateMeta) => void) => {
    const sub = updaterSubjects.updateAvailable.subscribe(fn);
    return () => {
      sub.unsubscribe();
    };
  },
  onUpdateReady: (fn: (versionMeta: UpdateMeta) => void) => {
    const sub = updaterSubjects.updateReady.subscribe(fn);
    return () => {
      sub.unsubscribe();
    };
  },
  onDownloadProgress: (fn: (progress: number) => void) => {
    const sub = updaterSubjects.downloadProgress.subscribe(fn);
    return () => {
      sub.unsubscribe();
    };
  },
} satisfies Record<string, MainEventRegister>;
