import { describe, expect,test } from 'vitest';
import { applyUpdate, Doc } from 'yjs';

import { createWorkerSync } from '../worker-sync';

describe('worker-sync', () => {
  test('basic', async () => {
    const api = createWorkerSync();
    const doc = new Doc();
    doc.on('update', update => {
      api.sendUpdate(doc.guid, update, 'origin');
    });
    doc.getMap().set('1', 2);
    const update = await api.encodeStateAsUpdate(doc.guid);
    {
      const doc = new Doc();
      applyUpdate(doc, update);
      const map = doc.getMap();
      expect(map.get('1')).toBe(2);
    }
  });
});
