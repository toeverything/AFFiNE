import type { MainEventRegister, WorkspaceMeta } from '../type';
import { deleteWorkspace, listWorkspaces } from './handlers';
import { getWorkspaceMeta } from './meta';
import { workspaceSubjects } from './subjects';

export * from './handlers';
export * from './subjects';

export const workspaceEvents = {
  onMetaChange: (
    fn: (meta: { workspaceId: string; meta: WorkspaceMeta }) => void
  ) => {
    const sub = workspaceSubjects.meta.subscribe(fn);
    return () => {
      sub.unsubscribe();
    };
  },
} satisfies Record<string, MainEventRegister>;

export const workspaceHandlers = {
  list: async () => listWorkspaces(),
  delete: async (id: string) => deleteWorkspace(id),
  getMeta: async (id: string) => {
    return getWorkspaceMeta(id);
  },
};
