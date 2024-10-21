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
    readonly fieldKey: string,
    readonly index: boolean = true,
    readonly store: boolean = true
  ) {}

  async match(trx: DataStructROTransaction, term: string): Promise<Match> {
    const objs = await trx
      .objectStore('invertedIndex')
      .index('key')
      .getAll(InvertedIndexKey.forString(this.fieldKey, term).buffer());
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
          InvertedIndexKey.forPrefix(this.fieldKey).buffer(),
          InvertedIndexKey.forPrefix(this.fieldKey).add1().buffer()
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
    for (const term of terms) {
      await trx.objectStore('invertedIndex').add({
        key: InvertedIndexKey.forString(this.fieldKey, term).buffer(),
        nid: id,
      });
    }
  }
}

export class IntegerInvertedIndex implements InvertedIndex {
  constructor(
    readonly fieldKey: string,
    readonly index: boolean = true,
    readonly store: boolean = true
  ) {}

  async match(trx: DataStructROTransaction, term: string): Promise<Match> {
    const objs = await trx
      .objectStore('invertedIndex')
      .index('key')
      .getAll(InvertedIndexKey.forInt64(this.fieldKey, BigInt(term)).buffer());
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
          InvertedIndexKey.forPrefix(this.fieldKey).buffer(),
          InvertedIndexKey.forPrefix(this.fieldKey).add1().buffer()
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
    for (const term of terms) {
      await trx.objectStore('invertedIndex').add({
        key: InvertedIndexKey.forInt64(this.fieldKey, BigInt(term)).buffer(),
        nid: id,
      });
    }
  }
}

export class BooleanInvertedIndex implements InvertedIndex {
  constructor(
    readonly fieldKey: string,
    readonly index: boolean = true,
    readonly store: boolean = true
  ) {}

  // eslint-disable-next-line sonarjs/no-identical-functions
  async all(trx: DataStructROTransaction): Promise<Match> {
    const objs = await trx
      .objectStore('invertedIndex')
      .index('key')
      .getAll(
        IDBKeyRange.bound(
          InvertedIndexKey.forPrefix(this.fieldKey).buffer(),
          InvertedIndexKey.forPrefix(this.fieldKey).add1().buffer()
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
      .getAll(
        InvertedIndexKey.forBoolean(this.fieldKey, term === 'true').buffer()
      );
    const match = new Match();
    for (const obj of objs) {
      match.addScore(obj.nid, 1);
    }
    return match;
  }

  async insert(trx: DataStructRWTransaction, id: number, terms: string[]) {
    for (const term of terms) {
      await trx.objectStore('invertedIndex').add({
        key: InvertedIndexKey.forBoolean(
          this.fieldKey,
          term === 'true'
        ).buffer(),
        nid: id,
      });
    }
  }
}

export class FullTextInvertedIndex implements InvertedIndex {
  constructor(
    readonly fieldKey: string,
    readonly index: boolean = true,
    readonly store: boolean = true
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
          .objectStore('kvMetadata')
          .get(`full-text:avg-field-length:${this.fieldKey}`)
      )?.value ?? 0;
    for (const token of queryTokens) {
      const key = InvertedIndexKey.forString(this.fieldKey, token.term);
      const objs = await trx
        .objectStore('invertedIndex')
        .index('key')
        .getAll(
          IDBKeyRange.bound(key.buffer(), key.add1().buffer(), false, true)
        );
      const submatched: {
        nid: number;
        score: number;
        position: {
          index: number;
          ranges: [number, number][];
        };
      }[] = [];
      for (const obj of objs) {
        const key = InvertedIndexKey.fromBuffer(obj.key);
        const originTokenTerm = key.asString();
        const matchLength = token.term.length;
        const position = obj.pos ?? {
          i: 0,
          l: 0,
          rs: [],
        };
        const termFreq = position.rs.length;
        const totalCount = objs.length;
        const fieldLength = position.l;
        const score =
          bm25(termFreq, 1, totalCount, fieldLength, avgFieldLength) *
          (matchLength / originTokenTerm.length);
        const match = {
          score,
          positions: new Map(),
        };
        const ranges = match.positions.get(position.i) || [];
        ranges.push(
          ...position.rs.map(([start, _end]) => [start, start + matchLength])
        );
        match.positions.set(position.i, ranges);
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
          InvertedIndexKey.forPrefix(this.fieldKey).buffer(),
          InvertedIndexKey.forPrefix(this.fieldKey).add1().buffer()
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
        await trx.objectStore('invertedIndex').add({
          key: InvertedIndexKey.forString(this.fieldKey, term).buffer(),
          nid: id,
          pos: {
            l: originString.length,
            i: i,
            rs: tokens.map(token => [token.start, token.end]),
          },
        });
      }

      const kvMetadataStore = trx.objectStore('kvMetadata');
      // update avg-field-length
      const totalCount =
        (await kvMetadataStore.get(`full-text:field-count:${this.fieldKey}`))
          ?.value ?? 0;
      const avgFieldLength =
        (
          await kvMetadataStore.get(
            `full-text:avg-field-length:${this.fieldKey}`
          )
        )?.value ?? 0;
      await kvMetadataStore.put({
        key: `full-text:field-count:${this.fieldKey}`,
        value: totalCount + 1,
      });
      await kvMetadataStore.put({
        key: `full-text:avg-field-length:${this.fieldKey}`,
        value:
          avgFieldLength +
          (terms.reduce((acc, term) => acc + term.length, 0) - avgFieldLength) /
            (totalCount + 1),
      });
    }
  }
}

export class InvertedIndexKey {
  constructor(
    readonly field: ArrayBuffer,
    readonly value: ArrayBuffer,
    readonly gap: ArrayBuffer = new Uint8Array([58])
  ) {}

  asString() {
    return new TextDecoder().decode(this.value);
  }

  asInt64() {
    return new DataView(this.value).getBigInt64(0, false); /* big-endian */
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
        new ArrayBuffer(0),
        new Uint8Array([59])
      );
    }
  }

  static forPrefix(field: string) {
    return new InvertedIndexKey(
      new TextEncoder().encode(field),
      new ArrayBuffer(0)
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
    const bytes = new ArrayBuffer(8);
    new DataView(bytes).setBigInt64(0, value, false); /* big-endian */
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
