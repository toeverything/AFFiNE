import type { NamespaceHandlers } from '../type';

export const updaterHandlers = {
  updateClient: async () => {
    const { updateClient } = await import('./updater');
    return updateClient();
  },
} satisfies NamespaceHandlers;

export * from './updater';
