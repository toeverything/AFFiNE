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

  insert(
    trx: DataStructRWTransaction,
    id: number,
    terms: string[]
  ): Promise<void>;
}

export class StringInvertedIndex implements InvertedIndex {
  constructor(readonly fieldKey: string) {}

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
  constructor(readonly fieldKey: string) {}

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
  constructor(readonly fieldKey: string) {}

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
  constructor(readonly fieldKey: string) {}

  async match(trx: DataStructROTransaction, term: string): Promise<Match> {
    const queryTokens = new GeneralTokenizer().tokenize(term);
    const matched = new Map<
      number,
      {
        score: number[];
        positions: Map<number, [number, number][]>;
      }
    >();
    for (const token of queryTokens) {
      const key = InvertedIndexKey.forString(this.fieldKey, token.term);
      const objs = await trx
        .objectStore('invertedIndex')
        .index('key')
        .getAll(
          IDBKeyRange.bound(key.buffer(), key.add1().buffer(), false, true)
        );
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
        const avgFieldLength =
          (
            await trx
              .objectStore('kvMetadata')
              .get(`full-text:avg-field-length:${this.fieldKey}`)
          )?.value ?? 0;
        const fieldLength = position.l;
        const score =
          bm25(termFreq, 1, totalCount, fieldLength, avgFieldLength) *
          (matchLength / originTokenTerm.length);
        const match = matched.get(obj.nid) || {
          score: [] as number[],
          positions: new Map(),
        };
        match.score.push(score);
        const ranges = match.positions.get(position.i) || [];
        ranges.push(
          ...position.rs.map(([start, _end]) => [start, start + matchLength])
        );
        match.positions.set(position.i, ranges);
        matched.set(obj.nid, match);
      }
    }
    const match = new Match();
    for (const [nid, { score, positions }] of matched) {
      match.addScore(
        nid,
        score.reduce((acc, s) => acc + s, 0)
      );

      for (const [index, ranges] of positions) {
        match.addHighlighter(nid, this.fieldKey, index, ranges);
      }
    }
    return match;
  }

  async insert(trx: DataStructRWTransaction, id: number, terms: string[]) {
    for (let i = 0; i < terms.length; i++) {
      const tokenMap = new Map<string, Token[]>();
      const term = terms[i];

      const tokens = new GeneralTokenizer().tokenize(term);

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
            l: term.length,
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
    readonly value: ArrayBuffer
  ) {}

  asString() {
    return new TextDecoder().decode(this.value);
  }

  asInt64() {
    return new DataView(this.value).getBigInt64(0, false); /* big-endian */
  }

  add1() {
    const bytes = new Uint8Array(this.value.slice(0));
    let carry = 1;
    for (let i = bytes.length - 1; i >= 0 && carry > 0; i--) {
      const sum = bytes[i] + carry;
      bytes[i] = sum % 256;
      carry = sum >> 8;
    }
    return new InvertedIndexKey(this.field, bytes);
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
    tmp.set([58], this.field.byteLength);
    if (this.value) {
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
