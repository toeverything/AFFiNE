import { type Query, type SearchOptions } from '../../../storage';
import { highlighter } from '../../idb/indexer/highlighter';
import { type NativeDBConnection } from '../db';
import { tryParseArrayField } from './utils';

export async function createNode(
  connection: NativeDBConnection,
  table: string,
  id: string,
  score: number,
  options: SearchOptions<any>,
  query: Query<any>
) {
  const node: any = { id, score };

  if (options.fields) {
    const fields: Record<string, any> = {};
    for (const field of options.fields) {
      const text = await connection.apis.ftsGetDocument(
        `${table}:${field as string}`,
        id
      );
      if (text !== null) {
        const parsed = tryParseArrayField(text);
        if (parsed) {
          fields[field as string] = parsed;
        } else {
          fields[field as string] = text;
        }
      } else {
        fields[field as string] = '';
      }
    }
    node.fields = fields;
  }

  if (options.highlights) {
    const highlights: Record<string, string[]> = {};
    const queryStrings = extractQueryStrings(query);

    for (const h of options.highlights) {
      const text = await connection.apis.ftsGetDocument(
        `${table}:${h.field as string}`,
        id
      );
      if (text) {
        const queryString = Array.from(queryStrings).join(' ');
        const matches = await connection.apis.ftsGetMatches(
          `${table}:${h.field as string}`,
          id,
          queryString
        );

        if (matches.length > 0) {
          const highlighted = highlighter(
            text,
            h.before,
            h.end,
            matches.map(m => [m.start, m.end]),
            {
              maxPrefix: 20,
              maxLength: 50,
            }
          );
          highlights[h.field as string] = highlighted ? [highlighted] : [];
        } else {
          highlights[h.field as string] = [];
        }
      } else {
        highlights[h.field as string] = [];
      }
    }
    node.highlights = highlights;
  }

  return node;
}

function extractQueryStrings(query: Query<any>): Set<string> {
  const terms = new Set<string>();
  if (query.type === 'match') {
    terms.add(query.match);
  } else if (query.type === 'boolean') {
    for (const q of query.queries) {
      const subTerms = extractQueryStrings(q);
      for (const term of subTerms) {
        terms.add(term);
      }
    }
  } else if (query.type === 'boost') {
    const subTerms = extractQueryStrings(query.query);
    for (const term of subTerms) {
      terms.add(term);
    }
  }
  return terms;
}
