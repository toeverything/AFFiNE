import type { DocEvent, DocEventBus } from '@toeverything/infra';

export class BroadcastChannelDocEventBus implements DocEventBus {
  senderChannel = new BroadcastChannel('doc:' + this.workspaceId);
  constructor(private readonly workspaceId: string) {}
  emit(event: DocEvent): void {
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
