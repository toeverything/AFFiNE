export class Match {
  scores = new Map<string, number>();
  /**
   * id -> field -> index(multi value field) -> [start, end][]
   */
  highlighters = new Map<
    string,
    Map<string, Map<number, [number, number][]>>
  >();

  constructor() {}

  size() {
    return this.scores.size;
  }

  getScore(id: string) {
    return this.scores.get(id) ?? 0;
  }

  addScore(id: string, score: number) {
    const currentScore = this.scores.get(id) || 0;
    this.scores.set(id, currentScore + score);
  }

  getHighlighters(id: string, field: string) {
    return this.highlighters.get(id)?.get(field);
  }

  addHighlighter(
    id: string,
    field: string,
    index: number,
    newRanges: [number, number][]
  ) {
    const fields =
      this.highlighters.get(id) ||
      new Map<string, Map<number, [number, number][]>>();
    const values = fields.get(field) || new Map<number, [number, number][]>();
    const ranges = values.get(index) || [];
    ranges.push(...newRanges);
    values.set(index, ranges);
    fields.set(field, values);
    this.highlighters.set(id, fields);
  }

  and(other: Match) {
    const newMatch = new Match();
    for (const [id, score] of this.scores) {
      if (other.scores.has(id)) {
        newMatch.addScore(id, score + (other.scores.get(id) ?? 0));
        newMatch.copyExtData(this, id);
        newMatch.copyExtData(other, id);
      }
    }
    return newMatch;
  }

  or(other: Match) {
    const newMatch = new Match();
    for (const [id, score] of this.scores) {
      newMatch.addScore(id, score);
      newMatch.copyExtData(this, id);
    }
    for (const [id, score] of other.scores) {
      newMatch.addScore(id, score);
      newMatch.copyExtData(other, id);
    }
    return newMatch;
  }

  exclude(other: Match) {
    const newMatch = new Match();
    for (const [id, score] of this.scores) {
      if (!other.scores.has(id)) {
        newMatch.addScore(id, score);
        newMatch.copyExtData(this, id);
      }
    }
    return newMatch;
  }

  boost(boost: number) {
    const newMatch = new Match();
    for (const [id, score] of this.scores) {
      newMatch.addScore(id, score * boost);
      newMatch.copyExtData(this, id);
    }
    return newMatch;
  }

  toArray() {
    return Array.from(this.scores.entries())
      .sort((a, b) => b[1] - a[1])
      .map(e => e[0]);
  }

  private copyExtData(from: Match, id: string) {
    for (const [field, values] of from.highlighters.get(id) ?? []) {
      for (const [index, ranges] of values) {
        this.addHighlighter(id, field, index, ranges);
      }
    }
  }
}
