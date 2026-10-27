export class RuntimeEventStream<T> implements AsyncIterableIterator<T> {
  private readonly values: T[] = [];
  private readonly readers: Array<(result: IteratorResult<T>) => void> = [];
  private ended = false;
  private abort?: () => void;

  attach(abort: () => void) {
    if (this.ended) {
      abort();
      return;
    }
    this.abort = abort;
  }

  push(value?: T) {
    if (this.ended) return;
    if (value === undefined) {
      this.ended = true;
      for (const reader of this.readers.splice(0)) {
        reader({ value: undefined, done: true });
      }
      return;
    }
    const reader = this.readers.shift();
    if (reader) reader({ value, done: false });
    else this.values.push(value);
  }

  [Symbol.asyncIterator]() {
    return this;
  }

  async next(): Promise<IteratorResult<T>> {
    const value = this.values.shift();
    if (value !== undefined) return { value, done: false };
    if (this.ended) return { value: undefined, done: true };
    return await new Promise(resolve => this.readers.push(resolve));
  }

  async return(): Promise<IteratorResult<T>> {
    this.abort?.();
    this.push();
    return { value: undefined, done: true };
  }
}
