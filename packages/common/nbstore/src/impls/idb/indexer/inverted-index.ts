import { bm25 } from './bm25';
import type {
  DataStructROTransaction,
  DataStructRWTransaction,
} from './data-struct';
import { Match } from './match';
import { GeneralTokenizer, type Token } from './tokenizer';

export interface InvertedIndex {
  fieldKey: string;

  match(trx: DataStructROTransaction, term: string): Promise<Match>;

  all(trx: DataStructROTransaction): Promise<Match>;

  insert(
    trx: DataStructRWTransaction,
    id: number,
    terms: string[]
  ): Promise<void>;
}

export class StringInvertedIndex implements InvertedIndex {
  constructor(
    readonly table: string,
    readonly fieldKey: string
  ) {}

  async match(trx: DataStructROTransaction, term: string): Promise<Match> {
    const objs = await trx
      .objectStore('invertedIndex')
      .index('key')
      .getAll([
        this.table,
        InvertedIndexKey.forString(this.fieldKey, term).buffer(),
      ]);
    const match = new Match();
    for (const obj of objs) {
      match.addScore(obj.nid, 1);
    }
    return match;
  }

  async all(trx: DataStructROTransaction): Promise<Match> {
    const objs = await trx
      .objectStore('invertedIndex')
      .index('key')
      .getAll(
        IDBKeyRange.bound(
          [this.table, InvertedIndexKey.forPrefix(this.fieldKey).buffer()],
          [
            this.table,
            InvertedIndexKey.forPrefix(this.fieldKey).add1().buffer(),
          ]
        )
      );

    const set = new Set<number>();
    for (const obj of objs) {
      set.add(obj.nid);
    }

    const match = new Match();
    for (const nid of set) {
      match.addScore(nid, 1);
    }
    return match;
  }

  async insert(trx: DataStructRWTransaction, id: number, terms: string[]) {
    const uniqueTerms = new Set(terms);
    await Promise.all(
      Array.from(uniqueTerms).map(term =>
        trx.objectStore('invertedIndex').put({
          table: this.table,
          key: InvertedIndexKey.forString(this.fieldKey, term).buffer(),
          nid: id,
        })
      )
    );
  }
}

export class IntegerInvertedIndex implements InvertedIndex {
  constructor(
    readonly table: string,
    readonly fieldKey: string
  ) {}

  async match(trx: DataStructROTransaction, term: string): Promise<Match> {
    const objs = await trx
      .objectStore('invertedIndex')
      .index('key')
      .getAll([
        this.table,
        InvertedIndexKey.forInt64(this.fieldKey, BigInt(term)).buffer(),
      ]);
    const match = new Match();
    for (const obj of objs) {
      match.addScore(obj.nid, 1);
    }
    return match;
  }

  // eslint-disable-next-line sonarjs/no-identical-functions
  async all(trx: DataStructROTransaction): Promise<Match> {
    const objs = await trx
      .objectStore('invertedIndex')
      .index('key')
      .getAll(
        IDBKeyRange.bound(
          [this.table, InvertedIndexKey.forPrefix(this.fieldKey).buffer()],
          [
            this.table,
            InvertedIndexKey.forPrefix(this.fieldKey).add1().buffer(),
          ]
        )
      );

    const set = new Set<number>();
    for (const obj of objs) {
      set.add(obj.nid);
    }

    const match = new Match();
    for (const nid of set) {
      match.addScore(nid, 1);
    }
    return match;
  }

  async insert(trx: DataStructRWTransaction, id: number, terms: string[]) {
    const uniqueTerms = new Set(terms);
    await Promise.all(
      Array.from(uniqueTerms).map(term =>
        trx.objectStore('invertedIndex').put({
          table: this.table,
          key: InvertedIndexKey.forInt64(this.fieldKey, BigInt(term)).buffer(),
          nid: id,
        })
      )
    );
  }
}

export class BooleanInvertedIndex implements InvertedIndex {
  constructor(
    readonly table: string,
    readonly fieldKey: string
  ) {}

  // eslint-disable-next-line sonarjs/no-identical-functions
  async all(trx: DataStructROTransaction): Promise<Match> {
    const objs = await trx
      .objectStore('invertedIndex')
      .index('key')
      .getAll(
        IDBKeyRange.bound(
          [this.table, InvertedIndexKey.forPrefix(this.fieldKey).buffer()],
          [
            this.table,
            InvertedIndexKey.forPrefix(this.fieldKey).add1().buffer(),
          ]
        )
      );

    const set = new Set<number>();
    for (const obj of objs) {
      set.add(obj.nid);
    }

    const match = new Match();
    for (const nid of set) {
      match.addScore(nid, 1);
    }
    return match;
  }

  async match(trx: DataStructROTransaction, term: string): Promise<Match> {
    const objs = await trx
      .objectStore('invertedIndex')
      .index('key')
      .getAll([
        this.table,
        InvertedIndexKey.forBoolean(this.fieldKey, term === 'true').buffer(),
      ]);
    const match = new Match();
    for (const obj of objs) {
      match.addScore(obj.nid, 1);
    }
    return match;
  }

  async insert(trx: DataStructRWTransaction, id: number, terms: string[]) {
    const uniqueTerms = new Set(terms);
    await Promise.all(
      Array.from(uniqueTerms).map(term =>
        trx.objectStore('invertedIndex').put({
          table: this.table,
          key: InvertedIndexKey.forBoolean(
            this.fieldKey,
            term === 'true'
          ).buffer(),
          nid: id,
        })
      )
    );
  }
}

export class FullTextInvertedIndex implements InvertedIndex {
  constructor(
    readonly table: string,
    readonly fieldKey: string
  ) {}

  async match(trx: DataStructROTransaction, term: string): Promise<Match> {
    const queryTokens = new GeneralTokenizer().tokenize(term);
    const matched = new Map<
      number,
      Map<
        number, // index
        {
          score: number;
          ranges: [number, number][];
        }
      >
    >();
    const avgFieldLength =
      (
        await trx
          .objectStore('indexerMetadata')
          .get(`full-text:avg-field-length:${this.table}:${this.fieldKey}`)
      )?.value ?? 0;
    for (const token of queryTokens) {
      const key = InvertedIndexKey.forString(this.fieldKey, token.term);
      const objs = [
        // match exact
        ...(await trx
          .objectStore('invertedIndex')
          .index('key')
          .getAll([this.table, key.buffer()])),
        // match prefix
        ...(await trx
          .objectStore('invertedIndex')
          .index('key')
          .getAll(
            IDBKeyRange.bound(
              [this.table, key.buffer()],
              [this.table, key.add1().buffer()],
              true,
              true
            ),
            5000 // get maximum 5000 items for prefix match
          )),
      ];
      const submatched: {
        nid: number;
        score: number;
        position: {
          index: number;
          ranges: [number, number][];
        };
      }[] = [];
      for (const obj of objs) {
        if (!obj) {
          continue;
        }
        const key = InvertedIndexKey.fromBuffer(obj.key);
        const originTokenTerm = key.asString();
        const matchLength = token.term.length;
        let positions = obj.pos
          ? Array.isArray(obj.pos)
            ? obj.pos
            : [obj.pos]
          : [
              {
                i: 0,
                l: 0,
                rs: [] as [number, number][],
              },
            ];

        for (const position of positions) {
          const termFreq = position.rs.length;
          const totalCount = objs.length;
          const fieldLength = position.l;
          const score =
            bm25(termFreq, 1, totalCount, fieldLength, avgFieldLength) *
            (matchLength / originTokenTerm.length);
          submatched.push({
            nid: obj.nid,
            score,
            position: {
              index: position.i,
              ranges: position.rs.map(([start, _end]) => [
                start,
                start + matchLength,
              ]),
            },
          });
        }
      }

      // normalize score
      const maxScore = submatched.reduce((acc, s) => Math.max(acc, s.score), 0);
      const minScore = submatched.reduce((acc, s) => Math.min(acc, s.score), 0);
      for (const { nid, score, position } of submatched) {
        const normalizedScore =
          maxScore === minScore
            ? score
            : (score - minScore) / (maxScore - minScore);
        const match =
          matched.get(nid) ??
          new Map<
            number, // index
            {
              score: number;
              ranges: [number, number][];
            }
          >();
        const item = match.get(position.index) || {
          score: 0,
          ranges: [],
        };
        item.score += normalizedScore;
        item.ranges.push(...position.ranges);
        match.set(position.index, item);
        matched.set(nid, match);
      }
    }
    const match = new Match();
    for (const [nid, items] of matched) {
      if (items.size === 0) {
        break;
      }
      let highestScore = -1;
      let highestIndex = -1;
      let highestRanges: [number, number][] = [];
      for (const [index, { score, ranges }] of items) {
        if (score > highestScore) {
          highestScore = score;
          highestIndex = index;
          highestRanges = ranges;
        }
      }
      match.addScore(nid, highestScore);
      match.addHighlighter(nid, this.fieldKey, highestIndex, highestRanges);
    }
    return match;
  }

  // eslint-disable-next-line sonarjs/no-identical-functions
  async all(trx: DataStructROTransaction): Promise<Match> {
    const objs = await trx
      .objectStore('invertedIndex')
      .index('key')
      .getAll(
        IDBKeyRange.bound(
          [this.table, InvertedIndexKey.forPrefix(this.fieldKey).buffer()],
          [
            this.table,
            InvertedIndexKey.forPrefix(this.fieldKey).add1().buffer(),
          ]
        )
      );

    const set = new Set<number>();
    for (const obj of objs) {
      set.add(obj.nid);
    }

    const match = new Match();
    for (const nid of set) {
      match.addScore(nid, 1);
    }
    return match;
  }

  async insert(trx: DataStructRWTransaction, id: number, terms: string[]) {
    const promises: Promise<any>[] = [];
    const totalTermLength = terms.reduce((acc, term) => acc + term.length, 0);
    const globalTokenMap = new Map<
      string,
      { l: number; i: number; rs: [number, number][] }[]
    >();

    for (let i = 0; i < terms.length; i++) {
      const tokenMap = new Map<string, Token[]>();
      const originString = terms[i];

      const tokens = new GeneralTokenizer().tokenize(originString);

      for (const token of tokens) {
        const tokens = tokenMap.get(token.term) || [];
        tokens.push(token);
        tokenMap.set(token.term, tokens);
      }

      for (const [term, tokens] of tokenMap) {
        const entry = globalTokenMap.get(term) || [];
        entry.push({
          l: originString.length,
          i: i,
          rs: tokens.map(token => [token.start, token.end]),
        });
        globalTokenMap.set(term, entry);
      }
    }

    for (const [term, positions] of globalTokenMap) {
      promises.push(
        trx.objectStore('invertedIndex').put({
          table: this.table,
          key: InvertedIndexKey.forString(this.fieldKey, term).buffer(),
          nid: id,
          pos: positions,
        })
      );
    }

    const indexerMetadataStore = trx.objectStore('indexerMetadata');
    const countKey = `full-text:field-count:${this.table}:${this.fieldKey}`;
    const avgKey = `full-text:avg-field-length:${this.table}:${this.fieldKey}`;

    const [countObj, avgObj] = await Promise.all([
      indexerMetadataStore.get(countKey),
      indexerMetadataStore.get(avgKey),
    ]);

    const totalCount = countObj?.value ?? 0;
    const avgFieldLength = avgObj?.value ?? 0;

    const newTotalCount = totalCount + terms.length;
    const newAvgFieldLength =
      (avgFieldLength * totalCount + totalTermLength) / newTotalCount;

    promises.push(
      indexerMetadataStore.put({
        key: countKey,
        value: newTotalCount,
      })
    );
    promises.push(
      indexerMetadataStore.put({
        key: avgKey,
        value: isNaN(newAvgFieldLength) ? 0 : newAvgFieldLength,
      })
    );

    await Promise.all(promises);
  }
}

export class InvertedIndexKey {
  constructor(
    readonly field: Uint8Array,
    readonly value: Uint8Array,
    readonly gap: Uint8Array = new Uint8Array([58])
  ) {}

  asString() {
    return new TextDecoder().decode(this.value);
  }

  asInt64() {
    return new DataView(this.value.buffer).getBigInt64(
      0,
      false
    ); /* big-endian */
  }

  add1() {
    if (this.value.byteLength > 0) {
      const bytes = new Uint8Array(this.value.slice(0));
      let carry = 1;
      for (let i = bytes.length - 1; i >= 0 && carry > 0; i--) {
        const sum = bytes[i] + carry;
        bytes[i] = sum % 256;
        carry = sum >> 8;
      }
      return new InvertedIndexKey(this.field, bytes);
    } else {
      return new InvertedIndexKey(
        this.field,
        new Uint8Array(0),
        new Uint8Array([59])
      );
    }
  }

  static forPrefix(field: string) {
    return new InvertedIndexKey(
      new TextEncoder().encode(field),
      new Uint8Array(0)
    );
  }

  static forString(field: string, value: string) {
    return new InvertedIndexKey(
      new TextEncoder().encode(field),
      new TextEncoder().encode(value)
    );
  }

  static forBoolean(field: string, value: boolean) {
    const bytes = new Uint8Array(1);
    bytes.set([value ? 1 : 0]);
    return new InvertedIndexKey(new TextEncoder().encode(field), bytes);
  }

  static forInt64(field: string, value: bigint) {
    const bytes = new Uint8Array(8);
    new DataView(bytes.buffer).setBigInt64(0, value, false); /* big-endian */
    return new InvertedIndexKey(new TextEncoder().encode(field), bytes);
  }

  buffer() {
    const tmp = new Uint8Array(
      this.field.byteLength + (this.value?.byteLength ?? 0) + 1
    );
    tmp.set(new Uint8Array(this.field), 0);
    tmp.set(new Uint8Array(this.gap), this.field.byteLength);
    if (this.value.byteLength > 0) {
      tmp.set(new Uint8Array(this.value), this.field.byteLength + 1);
    }
    return tmp.buffer;
  }

  static fromBuffer(buffer: ArrayBuffer) {
    const array = new Uint8Array(buffer);
    const fieldLength = array.indexOf(58);
    const field = array.slice(0, fieldLength);
    const value = array.slice(fieldLength + 1);
    return new InvertedIndexKey(field, value);
  }
}
