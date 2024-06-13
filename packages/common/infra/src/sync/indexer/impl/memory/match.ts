export class Match {
  scores = new Map<number, number>();
  highlighters = new Map<
    number,
    Map<string, ((before: string, after: string) => string[])[]>
  >();

  constructor() {}

  size() {
    return this.scores.size;
  }

  getScore(id: number) {
    return this.scores.get(id) ?? 0;
  }

  addScore(id: number, score: number) {
    const currentScore = this.scores.get(id) || 0;
    this.scores.set(id, currentScore + score);
  }

  getHighlighters(id: number, field: string) {
    return this.highlighters.get(id)?.get(field) ?? [];
  }

  addHighlighter(
    id: number,
    field: string,
    highlighter: (before: string, after: string) => string[]
  ) {
    const fields = this.highlighters.get(id) || new Map();
    const highlighters = fields.get(field) || [];
    highlighters.push(highlighter);
    fields.set(field, highlighters);
    this.highlighters.set(id, fields);
  }

  and(other: Match) {
    const newWeight = new Match();
    for (const [id, score] of this.scores) {
      if (other.scores.has(id)) {
        newWeight.addScore(id, score + (other.scores.get(id) ?? 0));
        newWeight.copyExtData(this, id);
        newWeight.copyExtData(other, id);
      }
    }
    return newWeight;
  }

  or(other: Match) {
    const newWeight = new Match();
    for (const [id, score] of this.scores) {
      newWeight.addScore(id, score);
      newWeight.copyExtData(this, id);
    }
    for (const [id, score] of other.scores) {
      newWeight.addScore(id, score);
      newWeight.copyExtData(other, id);
    }
    return newWeight;
  }

  exclude(other: Match) {
    const newWeight = new Match();
    for (const [id, score] of this.scores) {
      if (!other.scores.has(id)) {
        newWeight.addScore(id, score);
        newWeight.copyExtData(this, id);
      }
    }
    return newWeight;
  }

  boost(boost: number) {
    const newWeight = new Match();
    for (const [id, score] of this.scores) {
      newWeight.addScore(id, score * boost);
      newWeight.copyExtData(this, id);
    }
    return newWeight;
  }

  toArray() {
    return Array.from(this.scores.entries())
      .sort((a, b) => b[1] - a[1])
      .map(e => e[0]);
  }

  filter(predicate: (id: number) => boolean) {
    const newWeight = new Match();
    for (const [id, score] of this.scores) {
      if (predicate(id)) {
        newWeight.addScore(id, score);
        newWeight.copyExtData(this, id);
      }
    }
    return newWeight;
  }

  private copyExtData(from: Match, id: number) {
    for (const [field, highlighters] of from.highlighters.get(id) ?? []) {
      for (const highlighter of highlighters) {
        this.addHighlighter(id, field, highlighter);
      }
    }
  }
}
