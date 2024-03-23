export class AsyncLock {
  private _lock = Promise.resolve();

  async acquire() {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    let release: () => void = null!;
    const nextLock = new Promise<void>(resolve => {
      release = resolve;
    });

    await this._lock;
    this._lock = nextLock;
    return {
      release,
      [Symbol.dispose]: () => {
        release();
      },
    };
  }
}
