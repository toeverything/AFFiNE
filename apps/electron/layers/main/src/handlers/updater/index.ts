import type { NamespaceHandlers } from '../type';
import { updateClient } from './updater';

export const updaterHandlers = {
  updateClient: async () => {
    return updateClient();
  },
} satisfies NamespaceHandlers;

export * from './updater';
