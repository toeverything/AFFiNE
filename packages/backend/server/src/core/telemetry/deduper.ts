export class TelemetryDeduper {
  private readonly entries = new Map<string, number>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries: number
  ) {}

  isDuplicate(key: string, now = Date.now()) {
    const existing = this.entries.get(key);
    if (existing && existing > now) {
      return true;
    }

    this.entries.set(key, now + this.ttlMs);
    this.prune(now);
    return false;
  }

  private prune(now: number) {
    for (const [key, expiresAt] of this.entries) {
      if (expiresAt <= now || this.entries.size > this.maxEntries) {
        this.entries.delete(key);
        continue;
      }
      if (this.entries.size <= this.maxEntries) {
        break;
      }
    }
  }
}
