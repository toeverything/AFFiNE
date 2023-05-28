import { Subject } from 'rxjs';

export const dbSubjects = {
  // emit workspace id when the db file is missing
  fileMissing: new Subject<string>(),
  externalUpdate: new Subject<{ workspaceId: string; update: Uint8Array }>(),
};
