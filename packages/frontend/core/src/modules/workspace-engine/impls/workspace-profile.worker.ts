import { type MessageCommunicapable, OpConsumer } from '@toeverything/infra/op';
import { applyUpdate, Doc as YDoc } from 'yjs';

import type { WorkerOps } from './worker-ops';

const consumer = new OpConsumer<WorkerOps>(globalThis as MessageCommunicapable);

consumer.register('renderWorkspaceProfile', data => {
  const doc = new YDoc({
    guid: 'workspace',
  });
  for (const update of data) {
    applyUpdate(doc, update);
  }
  const meta = doc.getMap('meta');
  const name = meta.get('name');
  const avatar = meta.get('avatar');

  return {
    name: typeof name === 'string' ? name : undefined,
    avatar: typeof avatar === 'string' ? avatar : undefined,
  };
});
