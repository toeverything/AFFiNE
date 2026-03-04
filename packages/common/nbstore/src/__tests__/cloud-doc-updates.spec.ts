import { describe, expect, test } from 'vitest';

import { CloudDocStorage } from '../impls/cloud/doc';

const base64UpdateA = 'AQID';
const base64UpdateB = 'BAUG';

describe('CloudDocStorage broadcast updates', () => {
  test('emits updates from batch payload', () => {
    const storage = new CloudDocStorage({
      id: 'space-1',
      serverBaseUrl: 'http://localhost',
      isSelfHosted: true,
      type: 'workspace',
      readonlyMode: true,
    });

    (storage as any).connection.idConverter = {
      oldIdToNewId: (id: string) => id,
      newIdToOldId: (id: string) => id,
    };

    const received: Uint8Array[] = [];
    storage.subscribeDocUpdate(update => {
      received.push(update.bin);
    });

    storage.onServerUpdates({
      spaceType: 'workspace',
      spaceId: 'space-1',
      docId: 'doc-1',
      updates: [base64UpdateA, base64UpdateB],
      timestamp: Date.now(),
    });

    expect(received).toEqual([
      new Uint8Array([1, 2, 3]),
      new Uint8Array([4, 5, 6]),
    ]);
  });
});
