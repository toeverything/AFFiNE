export function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

export class Random {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  next(): number {
    if (this.seed) {
      return (
        ((2 ** 31 - 1) & (this.seed = Math.imul(48271, this.seed))) / 2 ** 31
      );
    } else {
      return Math.random();
    }
  }
}
