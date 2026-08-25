import { nanoid } from 'nanoid';

import { type AwarenessRecord, AwarenessStorageBase } from '../../storage';
import { BroadcastChannelConnection } from './channel';

type ChannelMessage =
  | {
      type: 'awareness-update';
      docId: string;
      bin: Uint8Array;
      origin?: string;
    }
  | {
      type: 'awareness-collect';
      docId: string;
      collectId: string;
    }
  | {
      type: 'awareness-collect-feedback';
      docId: string;
      bin: Uint8Array;
      collectId: string;
    };

interface BroadcastChannelAwarenessStorageOptions {
  id: string;
}

export class BroadcastChannelAwarenessStorage extends AwarenessStorageBase {
  static readonly identifier = 'BroadcastChannelAwarenessStorage';

  override readonly storageType = 'awareness';
  override readonly connection = new BroadcastChannelConnection({
    id: this.options.id,
  });
  get channel() {
    return this.connection.inner;
  }

  constructor(
    private readonly options: BroadcastChannelAwarenessStorageOptions
  ) {
    super();
  }

  private readonly subscriptions = new Map<
    string,
    Set<{
      onUpdate: (update: AwarenessRecord, origin?: string) => void;
      onCollect: () => Promise<AwarenessRecord | null>;
    }>
  >();

  override update(record: AwarenessRecord, origin?: string): Promise<void> {
    const subscribers = this.subscriptions.get(record.docId);
    if (subscribers) {
      subscribers.forEach(subscriber => subscriber.onUpdate(record, origin));
    }
    this.channel.postMessage({
      type: 'awareness-update',
      docId: record.docId,
      bin: record.bin,
      origin,
    } satisfies ChannelMessage);
    return Promise.resolve();
  }

  override subscribeUpdate(
    id: string,
    onUpdate: (update: AwarenessRecord, origin?: string) => void,
    onCollect: () => Promise<AwarenessRecord | null>
  ): () => void {
    const subscribers = this.subscriptions.get(id) ?? new Set();
    subscribers.forEach(subscriber => {
      subscriber
        .onCollect()
        .then(awareness => {
          if (awareness) {
            onUpdate(awareness);
          }
        })
        .catch(error => {
          console.error('error in on collect awareness', error);
        });
    });

    const collectUniqueId = nanoid();

    const onChannelMessage = (message: MessageEvent<ChannelMessage>) => {
      if (
        message.data.type === 'awareness-update' &&
        message.data.docId === id
      ) {
        onUpdate(
          {
            docId: message.data.docId,
            bin: message.data.bin,
          },
          message.data.origin
        );
      }
      if (
        message.data.type === 'awareness-collect' &&
        message.data.docId === id
      ) {
        onCollect()
          .then(awareness => {
            if (awareness) {
              this.channel.postMessage({
                type: 'awareness-collect-feedback',
                docId: message.data.docId,
                bin: awareness.bin,
                collectId: collectUniqueId,
              } satisfies ChannelMessage);
            }
          })
          .catch(error => {
            console.error('error in on collect awareness', error);
          });
      }
      if (
        message.data.type === 'awareness-collect-feedback' &&
        message.data.docId === id &&
        message.data.collectId === collectUniqueId
      ) {
        onUpdate({
          docId: message.data.docId,
          bin: message.data.bin,
        });
      }
    };

    this.channel.addEventListener('message', onChannelMessage);
    this.channel.postMessage({
      type: 'awareness-collect',
      docId: id,
      collectId: collectUniqueId,
    } satisfies ChannelMessage);

    const subscriber = {
      onUpdate,
      onCollect,
    };
    subscribers.add(subscriber);
    this.subscriptions.set(id, subscribers);

    return () => {
      subscribers.delete(subscriber);
      this.channel.removeEventListener('message', onChannelMessage);
    };
  }
}
