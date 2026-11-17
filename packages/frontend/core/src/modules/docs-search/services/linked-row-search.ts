import type { IndexerPreferOptions, SearchOptions } from '@affine/nbstore';
import type { IndexerFrontend } from '@affine/nbstore/frontend';
import { fromPromise } from '@toeverything/infra';
import { escape } from 'lodash-es';
import { of, switchMap } from 'rxjs';

export type DocSearchResult = {
  docId: string;
  title: string;
  score: number;
  blockId?: string;
  blockContent?: string;
};

export const DOC_SEARCH_LIMIT = 50;

const fieldString = (field: string | string[]) =>
  typeof field === 'string' ? field : field[0];

export function searchLinkedRows$(
  indexer: IndexerFrontend,
  query: string,
  prefer: IndexerPreferOptions,
  results: DocSearchResult[],
  getTitle: (docId: string) => string
) {
  if (results.length >= DOC_SEARCH_LIMIT) return of(results);
  const titleQuery = { type: 'match', field: 'title', match: query } as const;
  const titleOptions = {
    fields: ['docId', 'title'],
    pagination: { skip: 0, limit: DOC_SEARCH_LIMIT },
    prefer,
  } satisfies SearchOptions<'doc'> & { prefer: IndexerPreferOptions };
  return indexer.search$('doc', titleQuery, titleOptions).pipe(
    switchMap(firstPage =>
      fromPromise(async signal => {
        const merged = new Map(results.map(result => [result.docId, result]));
        let page = firstPage;
        let skip = 0;
        while (page.nodes.length) {
          signal.throwIfAborted();
          const titles = new Map(
            page.nodes.map(node => [
              fieldString(node.fields.docId),
              fieldString(node.fields.title),
            ])
          );
          const { buckets } = await indexer.aggregate(
            'block',
            {
              type: 'boolean',
              occur: 'must',
              queries: [
                {
                  type: 'match',
                  field: 'parentFlavour',
                  match: 'affine:database',
                },
                {
                  type: 'boolean',
                  occur: 'should',
                  queries: [...titles.keys()].map(docId => ({
                    type: 'match',
                    field: 'refDocId',
                    match: docId,
                  })),
                },
              ],
            },
            'docId',
            {
              pagination: { skip: 0, limit: DOC_SEARCH_LIMIT },
              hits: {
                pagination: { limit: 1 },
                fields: ['blockId', 'refDocId'],
              },
              prefer,
            }
          );
          for (const bucket of buckets) {
            if (merged.has(bucket.key)) continue;
            const hit = bucket.hits.nodes[0];
            const refs = hit.fields.refDocId;
            const target = (typeof refs === 'string' ? [refs] : refs).find(
              docId => titles.has(docId)
            );
            merged.set(bucket.key, {
              docId: bucket.key,
              title: getTitle(bucket.key),
              score: bucket.score,
              blockId: fieldString(hit.fields.blockId),
              blockContent: escape(target ? titles.get(target) : ''),
            });
            if (merged.size >= DOC_SEARCH_LIMIT) return [...merged.values()];
          }
          if (!page.pagination.hasMore) break;
          signal.throwIfAborted();
          skip += page.nodes.length;
          page = await indexer.search('doc', titleQuery, {
            ...titleOptions,
            pagination: page.pagination.nextCursor
              ? { cursor: page.pagination.nextCursor, limit: DOC_SEARCH_LIMIT }
              : { skip, limit: DOC_SEARCH_LIMIT },
          });
        }
        return [...merged.values()];
      })
    )
  );
}
