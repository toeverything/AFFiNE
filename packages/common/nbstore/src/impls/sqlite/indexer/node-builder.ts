import { type SearchOptions } from '../../../storage';
import { highlighter } from '../../idb/indexer/highlighter';
import type { NativeIndexHit } from '../db';

export function createNode(hit: NativeIndexHit, options: SearchOptions<any>) {
  const node: any = { id: hit.id, score: hit.score };
  const fields = new Map(hit.fields.map(field => [field.field, field.values]));

  if (options.fields) {
    node.fields = Object.fromEntries(
      options.fields.map(field => {
        const values = fields.get(String(field)) ?? [];
        return [String(field), values.length > 1 ? values : (values[0] ?? '')];
      })
    );
  }

  if (options.highlights) {
    const highlights = new Map(
      hit.highlights.map(item => [item.field, item.values])
    );
    node.highlights = Object.fromEntries(
      options.highlights.map(option => {
        const field = String(option.field);
        const source = fields.get(field) ?? [];
        const fragments = (highlights.get(field) ?? []).flatMap(value => {
          const text = source[value.valueIndex];
          if (!text) return [];
          const fragment = highlighter(
            text,
            option.before,
            option.end,
            value.spans.map(span => [span.start, span.end]),
            { maxPrefix: 20, maxLength: 50 }
          );
          return fragment ? [fragment] : [];
        });
        return [field, fragments];
      })
    );
  }

  return node;
}
