import { appContext } from '../../context';
import type { NamespaceHandlers } from '../type';
import { deleteWorkspace, listWorkspaces } from './workspace';

export const workspaceHandlers = {
  list: async () => listWorkspaces(appContext),
  delete: async (_, id: string) => deleteWorkspace(appContext, id),
} satisfies NamespaceHandlers;
