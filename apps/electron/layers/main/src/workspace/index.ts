import { appContext } from '../context';
import type {
  MainEventListener,
  NamespaceHandlers,
  WorkspaceMeta,
} from '../type';
import { deleteWorkspace, getWorkspaceMeta, listWorkspaces } from './handlers';
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
} satisfies Record<string, MainEventListener>;

export const workspaceHandlers = {
  list: async () => listWorkspaces(appContext),
  delete: async (_, id: string) => deleteWorkspace(appContext, id),
  getMeta: async (_, id: string) => {
    return getWorkspaceMeta(appContext, id);
  },
} satisfies NamespaceHandlers;
