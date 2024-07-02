import Fuse from 'fuse.js';

import { Match } from './match';

export interface InvertedIndex {
  fieldKey: string;

  match(term: string): Match;

  all(): Match;

  insert(id: number, term: string): void;

  clear(): void;
}

export class StringInvertedIndex implements InvertedIndex {
  index: Map<string, number[]> = new Map();

  constructor(readonly fieldKey: string) {}

  match(term: string): Match {
    const match = new Match();

    for (const id of this.index.get(term) ?? []) {
      match.addScore(id, 1);
    }

    return match;
  }

  all(): Match {
    const match = new Match();

    for (const [_term, ids] of this.index) {
      for (const id of ids) {
        if (match.getScore(id) === 0) {
          match.addScore(id, 1);
        }
      }
    }

    return match;
  }

  insert(id: number, term: string): void {
    const ids = this.index.get(term) ?? [];
    ids.push(id);
    this.index.set(term, ids);
  }

  clear(): void {
    this.index.clear();
  }
}

export class IntegerInvertedIndex implements InvertedIndex {
  index: Map<string, number[]> = new Map();

  constructor(readonly fieldKey: string) {}

  // eslint-disable-next-line sonarjs/no-identical-functions
  match(term: string): Match {
    const match = new Match();

    for (const id of this.index.get(term) ?? []) {
      match.addScore(id, 1);
    }

    return match;
  }

  // eslint-disable-next-line sonarjs/no-identical-functions
  all(): Match {
    const match = new Match();

    for (const [_term, ids] of this.index) {
      for (const id of ids) {
        if (match.getScore(id) === 0) {
          match.addScore(id, 1);
        }
      }
    }

    return match;
  }

  // eslint-disable-next-line sonarjs/no-identical-functions
  insert(id: number, term: string): void {
    const ids = this.index.get(term) ?? [];
    ids.push(id);
    this.index.set(term, ids);
  }

  clear(): void {
    this.index.clear();
  }
}

export class BooleanInvertedIndex implements InvertedIndex {
  index: Map<boolean, number[]> = new Map();

  constructor(readonly fieldKey: string) {}

  // eslint-disable-next-line sonarjs/no-identical-functions
  match(term: string): Match {
    const match = new Match();

    for (const id of this.index.get(term === 'true') ?? []) {
      match.addScore(id, 1);
    }

    return match;
  }

  // eslint-disable-next-line sonarjs/no-identical-functions
  all(): Match {
    const match = new Match();

    for (const [_term, ids] of this.index) {
      for (const id of ids) {
        if (match.getScore(id) === 0) {
          match.addScore(id, 1);
        }
      }
    }

    return match;
  }

  // eslint-disable-next-line sonarjs/no-identical-functions
  insert(id: number, term: string): void {
    const ids = this.index.get(term === 'true') ?? [];
    ids.push(id);
    this.index.set(term === 'true', ids);
  }

  clear(): void {
    this.index.clear();
  }
}

export class FullTextInvertedIndex implements InvertedIndex {
  records = [] as { id: number; v: string }[];
  index = Fuse.createIndex(['v'], [] as { id: number; v: string }[]);

  constructor(readonly fieldKey: string) {}

  match(term: string): Match {
    const searcher = new Fuse(
      this.records,
      {
        includeScore: true,
        includeMatches: true,
        shouldSort: true,
        keys: ['v'],
      },
      this.index
    );
    const result = searcher.search(term);

    const match = new Match();

    for (const value of result) {
      match.addScore(value.item.id, 1 - (value.score ?? 1));

      match.addHighlighter(value.item.id, this.fieldKey, (before, after) => {
        const matches = value.matches;
        if (!matches || matches.length === 0) {
          return [''];
        }

        const firstMatch = matches[0];

        const text = firstMatch.value;
        if (!text) {
          return [''];
        }

        let result = '';
        let pointer = 0;
        for (const match of matches) {
          for (const [start, end] of match.indices) {
            result += text.substring(pointer, start);
            result += `${before}${text.substring(start, end + 1)}${after}`;
            pointer = end + 1;
          }
        }
        result += text.substring(pointer);

        return [result];
      });
    }

    return match;
  }

  // eslint-disable-next-line sonarjs/no-identical-functions
  all(): Match {
    const match = new Match();

    for (const { id } of this.records) {
      if (match.getScore(id) === 0) {
        match.addScore(id, 1);
      }
    }

    return match;
  }

  insert(id: number, term: string): void {
    this.index.add({ id, v: term });
    this.records.push({ id, v: term });
  }

  clear(): void {
    this.records = [];
    this.index = Fuse.createIndex(['v'], [] as { id: number; v: string }[]);
  }
}
