import { WHITEBOARD_LOD } from '../../const';

export type SketchLodLevel = 'l0' | 'l1' | 'l2';

export function getSketchLodLevel(
  zoom: number,
  selected: boolean,
  hovered: boolean
): SketchLodLevel {
  if (selected || (hovered && zoom > WHITEBOARD_LOD.z1)) {
    return 'l2';
  }
  if (zoom < WHITEBOARD_LOD.z0) {
    return 'l0';
  }
  return 'l1';
}

export class LiveSketchBudget {
  readonly maxLive: number;

  private readonly live = new Set<string>();
  private readonly exempt = new Set<string>();

  constructor(maxLive = WHITEBOARD_LOD.maxLiveSketches) {
    this.maxLive = maxLive;
  }

  get size() {
    return this.live.size;
  }

  has(id: string) {
    return this.live.has(id);
  }

  acquire(id: string, liveBudgetExempt = false, steal = false): boolean {
    if (this.live.has(id)) return true;
    if (liveBudgetExempt) {
      this.exempt.add(id);
      this.live.add(id);
      return true;
    }
    const nonExempt = [...this.live].filter(item => !this.exempt.has(item));
    if (nonExempt.length >= this.maxLive) {
      if (!steal) return false;
      const victim = nonExempt[0];
      if (victim) this.release(victim);
    }
    this.live.add(id);
    return true;
  }

  release(id: string) {
    this.live.delete(id);
    this.exempt.delete(id);
  }

  reset() {
    this.live.clear();
    this.exempt.clear();
  }
}

export const liveSketchBudget = new LiveSketchBudget();
