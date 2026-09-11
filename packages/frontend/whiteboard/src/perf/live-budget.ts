export type LiveBudgetAcquireOptions = {
  /** Evict the lowest-priority holder when the budget is already full. */
  steal?: boolean;
  /** Priority from `livePriorityScore`; decides who is evicted on a steal. */
  score?: number;
};

/**
 * Caps how many heavy widget instances (ECharts, Excalidraw, a full data-view
 * kanban) may be live at once, per plan §5.4.
 *
 * Holders are kept with their priority score so a steal evicts the *lowest*
 * priority instance rather than an arbitrary one.
 */
export class LiveInstanceBudget {
  readonly maxLive: number;

  private readonly live = new Map<string, number>();
  private readonly exempt = new Set<string>();

  constructor(maxLive: number) {
    this.maxLive = maxLive;
  }

  get size() {
    return this.live.size;
  }

  has(id: string) {
    return this.live.has(id);
  }

  scoreOf(id: string) {
    return this.live.get(id);
  }

  acquire(
    id: string,
    liveBudgetExempt = false,
    opts: boolean | LiveBudgetAcquireOptions = false
  ): boolean {
    const steal = typeof opts === 'boolean' ? opts : !!opts.steal;
    const score = typeof opts === 'boolean' ? 0 : (opts.score ?? 0);

    if (this.live.has(id)) {
      this.live.set(id, score);
      return true;
    }
    if (liveBudgetExempt) {
      this.exempt.add(id);
      this.live.set(id, score);
      return true;
    }

    const nonExempt = [...this.live].filter(([key]) => !this.exempt.has(key));
    if (nonExempt.length >= this.maxLive) {
      if (!steal) return false;
      const victim = nonExempt.reduce((lowest, entry) =>
        entry[1] < lowest[1] ? entry : lowest
      );
      this.release(victim[0]);
    }
    this.live.set(id, score);
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
