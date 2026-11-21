import {
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
} from 'y-protocols/awareness';

import type { YOctoAwarenessSession } from '../../y-octo/index.js';
import type { AwarenessSource, SyncAwareness } from '../source.js';

type AwarenessChanges = Record<'added' | 'updated' | 'removed', number[]>;

type ChannelMessage =
  | { type: 'connect' }
  | { type: 'update'; update: Uint8Array };

function isYOctoAwarenessSession(
  awareness: SyncAwareness
): awareness is YOctoAwarenessSession {
  return (
    typeof (awareness as YOctoAwarenessSession).encodeUpdate === 'function' &&
    typeof (awareness as YOctoAwarenessSession).applyUpdate === 'function'
  );
}

export class BroadcastChannelAwarenessSource implements AwarenessSource {
  awareness: SyncAwareness | null = null;

  channel: BroadcastChannel | null = null;

  handleAwarenessUpdate = (changes: AwarenessChanges, origin: unknown) => {
    if (origin === 'remote' || !this.awareness) {
      return;
    }

    const changedClients = Object.values(changes).reduce((res, cur) =>
      res.concat(cur)
    );

    const update = isYOctoAwarenessSession(this.awareness)
      ? this.awareness.encodeUpdate(changedClients)
      : encodeAwarenessUpdate(this.awareness, changedClients);
    this.channel?.postMessage({
      type: 'update',
      update: update,
    } satisfies ChannelMessage);
  };

  constructor(readonly channelName: string) {}

  connect(awareness: SyncAwareness): void {
    this.channel = new BroadcastChannel(this.channelName);
    this.channel.postMessage({
      type: 'connect',
    } satisfies ChannelMessage);
    this.awareness = awareness;
    awareness.on('update', this.handleAwarenessUpdate);
    this.channel.addEventListener(
      'message',
      (event: MessageEvent<ChannelMessage>) => {
        this.handleChannelMessage(event);
      }
    );
  }

  disconnect(): void {
    this.awareness?.off('update', this.handleAwarenessUpdate);
    this.channel?.close();
    this.channel = null;
  }

  handleChannelMessage(event: MessageEvent<ChannelMessage>) {
    if (!this.awareness) {
      return;
    }
    if (event.data.type === 'update') {
      const update = event.data.update;
      if (isYOctoAwarenessSession(this.awareness)) {
        this.awareness.applyUpdate(update, 'remote');
      } else {
        applyAwarenessUpdate(this.awareness, update, 'remote');
      }
    }
    if (event.data.type === 'connect') {
      const update = isYOctoAwarenessSession(this.awareness)
        ? this.awareness.encodeUpdate([this.awareness.clientID])
        : encodeAwarenessUpdate(this.awareness, [this.awareness.clientID]);
      this.channel?.postMessage({
        type: 'update',
        update,
      } satisfies ChannelMessage);
    }
  }
}
