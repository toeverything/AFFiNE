import type { EventBasedChannel } from 'async-call-rpc';
import type { MessageEvent, MessagePortMain } from 'electron';

export class MessagePortElectronChannel implements EventBasedChannel {
  constructor(private port: MessagePortMain) {}

  on(listener: (data: unknown) => void) {
    const handlePort = (event: MessageEvent) => {
      listener(event.data);
    };
    this.port.on('message', handlePort);
    this.port.start();
    return () => {
      this.port.off('message', handlePort);
      this.port.close();
    };
  }

  send(data: unknown): void {
    this.port.postMessage(data);
  }
}
