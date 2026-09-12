/** Per-key async mutex so compact/push on the same doc cannot interleave. */
export class KeyedMutex {
  private readonly tails = new Map<string, Promise<void>>();

  async run<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    const next = previous.then(() => gate);
    this.tails.set(key, next);
    await previous;
    try {
      return await fn();
    } finally {
      release();
      if (this.tails.get(key) === next) {
        this.tails.delete(key);
      }
    }
  }
}
