import { Subject } from 'rxjs';

import type { WorkspaceMeta } from '../type';

export const workspaceSubjects = {
  meta: new Subject<{ workspaceId: string; meta: WorkspaceMeta }>(),
};
