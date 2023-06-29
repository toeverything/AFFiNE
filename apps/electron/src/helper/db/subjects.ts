import { Subject } from 'rxjs';

export const dbSubjects = {
  externalUpdate: new Subject<{
    workspaceId: string;
    update: Uint8Array;
    docId?: string;
  }>(),
};
