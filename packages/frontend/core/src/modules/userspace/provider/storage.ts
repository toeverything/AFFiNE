import { createIdentifier, type DocStorage } from '@toeverything/infra';

export interface UserspaceStorageProvider {
  getDocStorage(userId: string): DocStorage;
}

export const UserspaceStorageProvider =
  createIdentifier<UserspaceStorageProvider>('UserspaceStorageProvider');
