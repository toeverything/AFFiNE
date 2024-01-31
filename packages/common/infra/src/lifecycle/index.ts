export class CleanupService {
  private readonly cleanupCallbacks: (() => void)[] = [];
  constructor() {}
  add(fn: () => void) {
    this.cleanupCallbacks.push(fn);
  }
  cleanup() {
    this.cleanupCallbacks.forEach(fn => fn());
  }
}
