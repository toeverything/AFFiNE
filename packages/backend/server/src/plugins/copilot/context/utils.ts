export class GqlSignal implements AsyncDisposable {
  readonly abortController = new AbortController();

  get signal() {
    return this.abortController.signal;
  }

  async [Symbol.asyncDispose]() {
    this.abortController.abort();
  }
}
