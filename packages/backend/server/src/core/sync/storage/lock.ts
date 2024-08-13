export interface Locker {
  lock(domain: string, resource: string): Promise<Lock>;
}

export class SingletonLocker implements Locker {
  lockedResource = new Map<string, Lock>();
  constructor() {}

  async lock(domain: string, resource: string) {
    let lock = this.lockedResource.get(`${domain}:${resource}`);

    if (!lock) {
      lock = new Lock();
    }

    await lock.acquire();

    return lock;
  }
}

export class Lock {
  private inner: Promise<void> = Promise.resolve();
  private release: () => void = () => {};

  async acquire() {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
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
