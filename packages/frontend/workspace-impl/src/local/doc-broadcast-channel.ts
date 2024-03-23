import type { DocEvent, DocEventBus } from '@toeverything/infra';

type LegacyChannelMessage = {
  type: 'db-updated';
  payload: {
    docId: string;
    update: Uint8Array;
  };
  __from_new_doc_engine?: boolean;
};

export class BroadcastChannelDocEventBus implements DocEventBus {
  legacyChannel = new BroadcastChannel('indexeddb:' + this.workspaceId);
  senderChannel = new BroadcastChannel('doc:' + this.workspaceId);
  constructor(private readonly workspaceId: string) {
    this.legacyChannel.addEventListener(
      'message',
      (event: MessageEvent<LegacyChannelMessage>) => {
        if (event.data.__from_new_doc_engine) {
          return;
        }
        if (event.data.type === 'db-updated') {
          this.emit({
            type: 'LegacyClientUpdateCommitted',
            docId: event.data.payload.docId,
            update: event.data.payload.update,
          });
        }
      }
    );
  }
  emit(event: DocEvent): void {
    if (
      event.type === 'ClientUpdateCommitted' ||
      event.type === 'ServerUpdateCommitted'
    ) {
      this.legacyChannel.postMessage({
        type: 'db-updated',
        payload: {
          docId: event.docId,
          update: event.update,
        },
        __from_new_doc_engine: true,
      } satisfies LegacyChannelMessage);
    }
    this.senderChannel.postMessage(event);
  }

  on(cb: (event: DocEvent) => void): () => void {
    const listener = (event: MessageEvent<DocEvent>) => {
      cb(event.data);
    };
    const channel = new BroadcastChannel('doc:' + this.workspaceId);
    channel.addEventListener('message', listener);
    return () => {
      channel.removeEventListener('message', listener);
      channel.close();
    };
  }
}
