import type { YOctoAwarenessSession } from '@toeverything/infra';
import { nanoid } from 'nanoid';
import {
  applyAwarenessUpdate,
  type Awareness,
  encodeAwarenessUpdate,
} from 'y-protocols/awareness';

import type { AwarenessRecord } from '../storage/awareness';
import type { AwarenessSync } from '../sync/awareness';

type AwarenessChanges = Record<'added' | 'updated' | 'removed', number[]>;

export type ConnectableAwareness = Awareness | YOctoAwarenessSession;

function isYOctoAwarenessSession(
  awareness: ConnectableAwareness
): awareness is YOctoAwarenessSession {
  return (
    typeof (awareness as YOctoAwarenessSession).encodeUpdate === 'function' &&
    typeof (awareness as YOctoAwarenessSession).applyUpdate === 'function'
  );
}

export class AwarenessFrontend {
  constructor(private readonly sync: AwarenessSync) {}

  connectAwareness(awareness: ConnectableAwareness) {
    const uniqueId = nanoid();
    const handleAwarenessUpdate = (
      changes: AwarenessChanges,
      origin: unknown
    ) => {
      if (origin === uniqueId) {
        return;
      }
      const changedClients = Object.values(changes).reduce((res, cur) =>
        res.concat(cur)
      );

      const update = isYOctoAwarenessSession(awareness)
        ? awareness.encodeUpdate(changedClients)
        : encodeAwarenessUpdate(awareness, changedClients);
      this.sync
        .update(
          {
            docId: awareness.doc.guid,
            bin: update,
          },
          uniqueId
        )
        .catch(error => {
          console.error('update awareness error', error);
        });
    };

    awareness.on('change', handleAwarenessUpdate);
    const handleSyncUpdate = (update: AwarenessRecord, origin?: string) => {
      if (origin === uniqueId) {
        // skip self update
        return;
      }

      if (isYOctoAwarenessSession(awareness)) {
        awareness.applyUpdate(update.bin, uniqueId);
      } else {
        applyAwarenessUpdate(awareness, update.bin, uniqueId);
      }
    };
    const handleSyncCollect = () => {
      return Promise.resolve({
        docId: awareness.doc.guid,
        bin: isYOctoAwarenessSession(awareness)
          ? awareness.encodeUpdate([awareness.clientID])
          : encodeAwarenessUpdate(awareness, [awareness.clientID]),
      });
    };
    const unsubscribe = this.sync.subscribeUpdate(
      awareness.doc.guid,
      handleSyncUpdate,
      handleSyncCollect
    );

    awareness.once('destroy', () => {
      awareness.off('change', handleAwarenessUpdate);
      unsubscribe();
    });

    return () => {
      awareness.off('change', handleAwarenessUpdate);
      unsubscribe();
    };
  }
}
