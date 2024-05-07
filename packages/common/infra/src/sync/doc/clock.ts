export class ClockMap {
  max: number = 0;
  constructor(private readonly map: Map<string, number>) {
    for (const value of map.values()) {
      if (value > this.max) {
        this.max = value;
      }
    }
  }

  get(id: string): number {
    return this.map.get(id) ?? 0;
  }

  set(id: string, value: number) {
    this.map.set(id, value);
    if (value > this.max) {
      this.max = value;
    }
  }

  setIfBigger(id: string, value: number) {
    if (value > this.get(id)) {
      this.set(id, value);
    }
  }

  clear() {
    this.map.clear();
    this.max = 0;
  }
}
