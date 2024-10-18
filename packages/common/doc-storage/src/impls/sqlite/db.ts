import { DocStorage as NativeDocStorage } from '@affine/native';

export const SqliteProtocol = {
  async init(path: string) {
    const db = new NativeDocStorage(path);
    await db.connect();
    return db;
  },
};
