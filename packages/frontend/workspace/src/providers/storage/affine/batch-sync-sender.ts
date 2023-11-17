interface SyncUpdateSender {
  (
    guid: string,
    updates: Uint8Array[]
  ): Promise<{
    accepted: boolean;
    retry: boolean;
  }>;
}

/**
 * BatchSyncSender is simple wrapper with vanilla update sync with several advanced features:
 *   - ACK mechanism, send updates sequentially with previous sync request correctly responds with ACK
 *   - batching updates, when waiting for previous ACK, new updates will be buffered and sent in single sync request
 *   - retryable, allow retry when previous sync request failed but with retry flag been set to true
 */
export class BatchSyncSender {
  private buffered: Uint8Array[] = [];
  private job: Promise<void> | null = null;
  private started = true;

  constructor(
    private guid: string,
    private readonly rawSender: SyncUpdateSender
  ) {}

  send(update: Uint8Array) {
    this.buffered.push(update);
    this.next();
    return Promise.resolve();
  }

  stop() {
    this.started = false;
  }

  start() {
    this.started = true;
    this.next();
  }

  private next() {
    if (!this.started || this.job || !this.buffered.length) {
      return;
    }

    const lastIndex = Math.min(
      this.buffered.length - 1,
      99 /* max batch updates size */
    );
    const updates = this.buffered.slice(0, lastIndex + 1);

    if (updates.length) {
      this.job = this.rawSender(this.guid, updates)
        .then(({ accepted, retry }) => {
          // remove pending updates if updates are accepted
          if (accepted) {
            this.buffered.splice(0, lastIndex + 1);
          }

          // stop when previous sending failed and non-recoverable
          if (accepted || retry) {
            // avoid call stack overflow
            setTimeout(() => {
              this.next();
            }, 0);
          } else {
            this.stop();
          }
        })
        .catch(() => {
          this.stop();
        })
        .finally(() => {
          this.job = null;
        });
    }
  }
}

export class MultipleBatchSyncSender {
  private senders: Record<string, BatchSyncSender> = {};

  constructor(private readonly rawSender: SyncUpdateSender) {}

  async send(guid: string, update: Uint8Array) {
    return this.getSender(guid).send(update);
  }

  private getSender(guid: string) {
    let sender = this.senders[guid];
    if (!sender) {
      sender = new BatchSyncSender(guid, this.rawSender);
      this.senders[guid] = sender;
    }

    return sender;
  }

  start() {
    Object.values(this.senders).forEach(sender => sender.start());
  }

  stop() {
    Object.values(this.senders).forEach(sender => sender.stop());
  }
}
