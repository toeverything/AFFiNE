import type {
  AwarenessRecord,
  AwarenessStorage,
} from '../../storage/awareness';
import type { PeerStorageOptions } from '../types';

export interface AwarenessSync {
  update(record: AwarenessRecord, origin?: string): Promise<void>;
  subscribeUpdate(
    id: string,
    onUpdate: (update: AwarenessRecord, origin?: string) => void,
    onCollect: () => Promise<AwarenessRecord | null>
  ): () => void;
}

export class AwarenessSyncImpl implements AwarenessSync {
  constructor(readonly storages: PeerStorageOptions<AwarenessStorage>) {}

  async update(record: AwarenessRecord, origin?: string) {
    await Promise.all(
      [this.storages.local, ...Object.values(this.storages.remotes)].map(
        peer =>
          peer.connection.status === 'connected'
            ? peer.update(record, origin)
            : Promise.resolve()
      )
    );
  }

  subscribeUpdate(
    id: string,
    onUpdate: (update: AwarenessRecord, origin?: string) => void,
    onCollect: () => Promise<AwarenessRecord | null>
  ): () => void {
    const unsubscribes = [
      this.storages.local,
      ...Object.values(this.storages.remotes),
    ].map(peer => peer.subscribeUpdate(id, onUpdate, onCollect));
    return () => {
      unsubscribes.forEach(unsubscribe => unsubscribe());
    };
  }
}
