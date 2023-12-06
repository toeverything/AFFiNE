import { createIndexeddbStorage } from '@blocksuite/store';

export async function migrateLocalBlobStorage(from: string, to: string) {
  const fromStorage = createIndexeddbStorage(from);
  const toStorage = createIndexeddbStorage(to);
  const keys = await fromStorage.crud.list();
  for (const key of keys) {
    const value = await fromStorage.crud.get(key);
    if (!value) {
      console.warn('cannot find blob:', key);
      continue;
    }
    await toStorage.crud.set(key, value);
  }
}
