export class AsyncLock {
  private _lock: Promise<void> | null = null;

  async acquire() {
    let release: (() => void) | null = null;
    const nextLock = new Promise<void>(resolve => {
      release = () => {
        this._lock = null;
        resolve();
      };
    });

    // Atomic check and set of lock state
    const currentLock = this._lock;
    this._lock = nextLock;

    if (currentLock) {
      await currentLock;
    }

    return {
      release: () => {
        if (release) {
          release();
          release = null;
        }
      },
      [Symbol.dispose]: () => {
        if (release) {
          release();
          release = null;
        }
      },
    };
  }
}
