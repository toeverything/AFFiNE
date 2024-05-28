import type { AwarenessConnection } from '@toeverything/infra';
import type { Awareness } from 'y-protocols/awareness.js';
import {
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
} from 'y-protocols/awareness.js';

type AwarenessChanges = Record<'added' | 'updated' | 'removed', number[]>;

type ChannelMessage =
  | { type: 'connect' }
  | { type: 'update'; update: Uint8Array };

export class BroadcastChannelAwarenessConnection
  implements AwarenessConnection
{
  channel: BroadcastChannel | null = null;
  awareness: Awareness | null = null;

  constructor(private readonly workspaceId: string) {}

  connect(awareness: Awareness): void {
    this.awareness = awareness;
    this.channel = new BroadcastChannel('awareness:' + this.workspaceId);
    this.channel.postMessage({
      type: 'connect',
    } satisfies ChannelMessage);
    this.awareness.on('update', this.handleAwarenessUpdate);
    this.channel.addEventListener('message', this.handleChannelMessage);
  }

  disconnect(): void {
    this.channel?.close();
    this.channel = null;
    this.awareness?.off('update', this.handleAwarenessUpdate);
    this.awareness = null;
  }

  handleAwarenessUpdate = (changes: AwarenessChanges, origin: unknown) => {
    if (this.awareness === null) {
      return;
    }

    if (origin === 'remote') {
      return;
    }

    const changedClients = Object.values(changes).reduce((res, cur) =>
      res.concat(cur)
    );

    const update = encodeAwarenessUpdate(this.awareness, changedClients);
    this.channel?.postMessage({
      type: 'update',
      update: update,
    } satisfies ChannelMessage);
  };

  handleChannelMessage = (event: MessageEvent<ChannelMessage>) => {
    if (this.awareness === null) {
      return;
    }

    if (event.data.type === 'update') {
      const update = event.data.update;
      applyAwarenessUpdate(this.awareness, update, 'remote');
    }
    if (event.data.type === 'connect') {
      this.channel?.postMessage({
        type: 'update',
        update: encodeAwarenessUpdate(this.awareness, [
          this.awareness.clientID,
        ]),
      } satisfies ChannelMessage);
    }
  };
}
