import type { Awareness } from 'y-protocols/awareness';

import type { YOctoAwarenessSession } from '../y-octo/index.js';

export type SyncAwareness = Awareness | YOctoAwarenessSession;

export interface AwarenessSource {
  connect(awareness: SyncAwareness): void;
  disconnect(): void;
}
