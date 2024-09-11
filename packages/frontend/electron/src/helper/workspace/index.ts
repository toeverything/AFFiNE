import type { MainEventRegister } from '../type';
import { deleteWorkspace } from './handlers';

export * from './handlers';
export * from './subjects';

export const workspaceEvents = {} as Record<string, MainEventRegister>;

export const workspaceHandlers = {
  delete: async (id: string) => deleteWorkspace(id),
};
