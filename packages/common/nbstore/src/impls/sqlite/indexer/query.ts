import { IndexerSchema, type Query } from '../../../storage';
import { type NativeDBConnection } from '../db';
import { Match } from './match';

export async function queryRaw(
  connection: NativeDBConnection,
  table: string,
  query: Query<any>
): Promise<Match> {
  if (query.type === 'match') {
    const indexName = `${table}:${String(query.field)}`;
    const hits = await connection.apis.ftsSearch(indexName, query.match);
    const match = new Match();
    for (const hit of hits ?? []) {
      match.addScore(hit.id, hit.score);
    }
    return match;
  } else if (query.type === 'boolean') {
    const matches: Match[] = [];
    for (const q of query.queries) {
      matches.push(await queryRaw(connection, table, q));
    }

    if (query.occur === 'must') {
      if (matches.length === 0) return new Match();
      return matches.reduce((acc, m) => acc.and(m));
    } else if (query.occur === 'should') {
      if (matches.length === 0) return new Match();
      return matches.reduce((acc, m) => acc.or(m));
    } else if (query.occur === 'must_not') {
      const union = matches.reduce((acc, m) => acc.or(m), new Match());
      const all = await matchAll(connection, table);
      return all.exclude(union);
    }
  } else if (query.type === 'all') {
    return matchAll(connection, table);
  } else if (query.type === 'boost') {
    const match = await queryRaw(connection, table, query.query);
    return match.boost(query.boost);
  } else if (query.type === 'exists') {
    const indexName = `${table}:${String(query.field)}`;
    const hits = await connection.apis.ftsSearch(indexName, '*');
    const match = new Match();
    for (const hit of hits ?? []) {
      match.addScore(hit.id, 1);
    }
    return match;
  }

  return new Match();
}

export async function matchAll(
  connection: NativeDBConnection,
  table: string
): Promise<Match> {
  const schema = IndexerSchema[table as keyof IndexerSchema];
  if (!schema) return new Match();

  const match = new Match();
  for (const field of Object.keys(schema)) {
    const indexName = `${table}:${field}`;
    let hits = await connection.apis.ftsSearch(indexName, '');
    if (!hits || hits.length === 0) {
      hits = await connection.apis.ftsSearch(indexName, '*');
    }
    for (const hit of hits ?? []) {
      match.addScore(hit.id, 1);
    }
  }
  return match;
}
