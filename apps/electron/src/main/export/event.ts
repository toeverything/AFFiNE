import { Subject } from 'rxjs';

import type { MainEventRegister } from '../type';

export interface ExportMeta {
  filePath: string;
  fileType: string;
  channelReply: string;
  channelError: string;
}

export const exportSubjects = {
  transPageToCanvas: new Subject<ExportMeta>(),
};

export const exportEvents = {
  transPageToCanvas: (fn: (exportMeta: ExportMeta) => void) => {
    const sub = exportSubjects.transPageToCanvas.subscribe(fn);
    return () => {
      sub.unsubscribe();
    };
  },
} satisfies Record<string, MainEventRegister>;
