export interface Locker {
  lock(domain: string, resource: string): Promise<AsyncDisposable>;
}

export class SingletonLocker implements Locker {
  lockedResource = new Map<string, Lock>();
  constructor() {}

  async lock(domain: string, resource: string) {
    const key = `${domain}:${resource}`;
    let lock = this.lockedResource.get(key);

    if (!lock) {
      lock = new Lock();
      this.lockedResource.set(key, lock);
    }

    await lock.acquire();

    return lock;
  }
}

export class Lock {
  private inner: Promise<void> = Promise.resolve();
  private release: () => void = () => {};

  async acquire() {
    // oxlint-disable-next-line @typescript-eslint/no-non-null-assertion
    let release: () => void = null!;
    const nextLock = new Promise<void>(resolve => {
      release = resolve;
    });

    await this.inner;
    this.inner = nextLock;
    this.release = release;
  }

  [Symbol.asyncDispose]() {
    this.release();
    return Promise.resolve();
  }
}
