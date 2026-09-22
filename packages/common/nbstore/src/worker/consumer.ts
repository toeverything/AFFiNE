import { OpConsumer } from '@toeverything/infra/op';

import { type StorageConstructor } from '../impls';
import { RealtimeManager } from '../realtime';
import { TelemetryManager } from '../telemetry/manager';
import type { WorkerManagerOps, WorkerOps } from './ops';
import { StoreConsumer } from './store';

export type { WorkerManagerOps };

export class StoreManagerConsumer {
  private readonly storeDisposers = new Map<string, () => Promise<void>>();
  private readonly storePool = new Map<
    string,
    { store: StoreConsumer; refCount: number }
  >();
  private readonly pending = new Map<string, Promise<void>>();

  private serialize<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const result = (this.pending.get(key) ?? Promise.resolve()).then(operation);
    const settled = result.then(
      () => {},
      () => {}
    );
    this.pending.set(key, settled);
    const clear = () => {
      if (this.pending.get(key) === settled) this.pending.delete(key);
    };
    settled.then(clear, clear);
    return result;
  }

  private readonly telemetry = new TelemetryManager();
  private readonly realtime = new RealtimeManager();

  constructor(
    private readonly availableStorageImplementations: StorageConstructor[]
  ) {}

  bindConsumer(consumer: OpConsumer<WorkerManagerOps>) {
    this.registerHandlers(consumer);
  }

  private registerHandlers(consumer: OpConsumer<WorkerManagerOps>) {
    consumer.registerAll({
      open: ({ port, key, closeKey, options }) => {
        let dispose: (() => Promise<void>) | undefined;
        const opening = this.serialize(key, async () => {
          let entry = this.storePool.get(key);
          if (!entry) {
            entry = {
              store: new StoreConsumer(
                this.availableStorageImplementations,
                options
              ),
              refCount: 0,
            };
            this.storePool.set(key, entry);
          } else {
            await entry.store.reconfigure(options);
          }
          const storeRef = entry;
          const worker = new OpConsumer<WorkerOps>(port);
          storeRef.refCount++;
          storeRef.store.bindConsumer(worker);
          dispose = async () => {
            worker.destroy();
            port.close();
            storeRef.refCount--;
            if (storeRef.refCount === 0) {
              try {
                await storeRef.store.destroy();
              } finally {
                this.storePool.delete(key);
              }
            }
          };
          return closeKey;
        });
        this.storeDisposers.set(closeKey, () =>
          this.serialize(key, async () => {
            await dispose?.();
          })
        );
        return opening.catch(error => {
          this.storeDisposers.delete(closeKey);
          port.close();
          throw error;
        });
      },
      close: key => {
        const dispose = this.storeDisposers.get(key);
        if (!dispose) throw new Error('Worker not found');
        this.storeDisposers.delete(key);
        return dispose();
      },
      'telemetry.setContext': context => this.telemetry.setContext(context),
      'telemetry.track': event => this.telemetry.track(event),
      'telemetry.pageview': event => this.telemetry.pageview(event),
      'telemetry.flush': () => this.telemetry.flush(),
      'telemetry.getQueueState': () => this.telemetry.getQueueState(),
      'realtime.configure': context => this.realtime.setContext(context),
      'realtime.request': ({ op, input, timeoutMs }) =>
        this.realtime.request(op, input, { timeoutMs }),
      'realtime.subscribe': ({ topic, input }) =>
        this.realtime.subscribe(topic, input),
      'realtime.status': () => this.realtime.getStatus(),
    });
  }
}
