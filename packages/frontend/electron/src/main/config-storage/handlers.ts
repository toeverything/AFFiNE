import type { NamespaceHandlers } from '../type';
import { persistentConfig } from './persist';

/**
 * @deprecated use shared storage
 */
export const configStorageHandlers = {
  get: async () => persistentConfig.get(),
  set: async (_, v) => persistentConfig.set(v),
} satisfies NamespaceHandlers;
