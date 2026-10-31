import { toDocSearchParams } from '@affine/core/modules/navigation';
import type {
  IndexerPreferOptions,
  IndexerSyncState,
  Query,
} from '@affine/nbstore';
import {
  type ReferenceParams,
  ReferenceParamsSchema,
} from '@blocksuite/affine/model';
import { fromPromise, LiveData, Service } from '@toeverything/infra';
import { isEmpty, omit } from 'lodash-es';
import {
  distinctUntilChanged,
  map,
  type Observable,
  of,
  switchMap,
} from 'rxjs';
import { z } from 'zod';

import { normalizeSearchText } from '../../../utils/normalize-search-text';
import type { DocsService } from '../../doc/services/docs';
import type { WorkspaceService } from '../../workspace';

const IndexedReferenceSchema = ReferenceParamsSchema.extend({
  docId: z.string().min(1),
});

function parseIndexedReferences(value: unknown) {
  const payloads =
    typeof value === 'string'
      ? [value]
      : Array.isArray(value)
        ? value.filter((item): item is string => typeof item === 'string')
        : [];
  const refs: ({ docId: string } & ReferenceParams)[] = [];
  let malformed = Array.isArray(value)
    ? value.length - payloads.length
    : typeof value === 'string'
      ? 0
      : 1;

  for (const payload of payloads) {
    try {
      const result = IndexedReferenceSchema.safeParse(JSON.parse(payload));
      if (result.success) {
        refs.push(result.data);
      } else {
        malformed++;
      }
    } catch {
      malformed++;
    }
  }
  return { refs, malformed };
}

export type IndexedDocReference = {
  title: string;
  docId: string;
  params?: ReturnType<typeof toDocSearchParams>;
};

const stringField = (value: unknown) =>
  typeof value === 'string'
    ? value
    : Array.isArray(value) && typeof value[0] === 'string'
      ? value[0]
      : null;

const equalReferenceSets = (
  previous: readonly IndexedDocReference[],
  current: readonly IndexedDocReference[]
) => {
  if (previous.length !== current.length) return false;
  const currentIds = new Set(current.map(reference => reference.docId));
  return previous.every(reference => currentIds.has(reference.docId));
};

export class DocsSearchService extends Service {
  constructor(
    private readonly workspaceService: WorkspaceService,
    private readonly docsService: DocsService
  ) {
    super();
  }

  get indexer() {
    return this.workspaceService.workspace.engine.indexer;
  }

  readonly indexerState$ = LiveData.from(this.indexer.state$, {
    indexing: 0,
    errorMessage: null,
  } as IndexerSyncState);

  searchTitle$(query: string) {
    return this.indexer
      .search$(
        'doc',
        {
          type: 'match',
          field: 'title',
          match: query,
        },
        {
          pagination: {
            skip: 0,
            limit: Infinity,
          },
        }
      )
      .pipe(
        map(({ nodes }) => {
          return nodes.map(node => node.id);
        })
      );
  }

  search$(
    query: string,
    prefer: IndexerPreferOptions = 'remote'
  ): Observable<
    {
      docId: string;
      title: string;
      score: number;
      blockId?: string;
      blockContent?: string;
    }[]
  > {
    return this.indexer
      .aggregate$(
        'block',
        {
          type: 'boolean',
          occur: 'must',
          queries: [
            {
              type: 'match',
              field: 'content',
              match: query,
            },
            {
              type: 'boolean',
              occur: 'should',
              queries: [
                {
                  type: 'match',
                  field: 'content',
                  match: query,
                },
                {
                  type: 'boost',
                  boost: 1.5,
                  query: {
                    type: 'match',
                    field: 'flavour',
                    match: 'affine:page',
                  },
                },
              ],
            },
          ],
        },
        'docId',
        {
          pagination: {
            limit: 50,
            skip: 0,
          },
          hits: {
            pagination: {
              limit: 2,
              skip: 0,
            },
            fields: ['blockId', 'flavour'],
            highlights: [
              {
                field: 'content',
                before: '<b>',
                end: '</b>',
              },
            ],
          },
          prefer,
        }
      )
      .pipe(
        map(({ buckets }) => {
          const result = [];

          for (const bucket of buckets) {
            const firstMatchFlavour = bucket.hits.nodes[0]?.fields.flavour;
            if (firstMatchFlavour === 'affine:page') {
              // is title match
              const blockContent = normalizeSearchText(
                bucket.hits.nodes[1]?.highlights.content[0]
              ); // try to get block content
              result.push({
                docId: bucket.key,
                title: normalizeSearchText(
                  bucket.hits.nodes[0].highlights.content[0]
                ),
                score: bucket.score,
                blockContent,
              });
            } else {
              const title =
                this.docsService.list.doc$(bucket.key).value?.title$.value ??
                '';
              const matchedBlockId = bucket.hits.nodes[0]?.fields.blockId;
              // is block match
              result.push({
                docId: bucket.key,
                title: title,
                blockId:
                  typeof matchedBlockId === 'string'
                    ? matchedBlockId
                    : matchedBlockId[0],
                score: bucket.score,
                blockContent: normalizeSearchText(
                  bucket.hits.nodes[0]?.highlights.content[0]
                ),
              });
            }
          }

          return result;
        })
      );
  }

  watchRefsFrom(ids: string | string[]) {
    const docIds = Array.isArray(ids) ? ids : [ids];
    if (docIds.length === 0) {
      return of([]);
    }

    return this.watchRefsBySourceFrom(docIds).pipe(
      map((refsBySource): IndexedDocReference[] => {
        const refs = Array.from(refsBySource.values()).flat();
        return Array.from(
          new Map(
            refs
              .filter(ref => !docIds.includes(ref.docId))
              .map(ref => [ref.docId, ref])
          ).values()
        );
      }),
      distinctUntilChanged((previous, current) =>
        equalReferenceSets(previous, current)
      )
    );
  }

  watchRefsBySourceFrom(ids: string | string[]) {
    const docIds = Array.isArray(ids) ? ids : [ids];
    if (docIds.length === 0) {
      return of(new Map<string, IndexedDocReference[]>());
    }

    return this.indexer
      .search$(
        'block',
        {
          type: 'boolean',
          occur: 'must',
          queries: [
            {
              type: 'boolean',
              occur: 'should',
              queries: docIds.map(id => ({
                type: 'match',
                field: 'docId',
                match: id,
              })),
            },
            {
              type: 'exists',
              field: 'refDocId',
            },
          ],
        },
        {
          fields: ['docId', 'refDocId', 'ref'],
          pagination: {
            limit: Infinity,
          },
        }
      )
      .pipe(
        switchMap(({ nodes }) => {
          return fromPromise(async () => {
            let malformed = 0;
            const refsBySource = new Map<
              string,
              Map<string, { docId: string } & ReferenceParams>
            >();
            for (const node of nodes) {
              const sourceId = stringField(node.fields.docId);
              const parsed = parseIndexedReferences(node.fields.ref);
              malformed += parsed.malformed;
              if (!sourceId || !docIds.includes(sourceId)) continue;
              let sourceRefs = refsBySource.get(sourceId);
              if (!sourceRefs) {
                sourceRefs = new Map();
                refsBySource.set(sourceId, sourceRefs);
              }
              for (const ref of parsed.refs) {
                if (ref.docId !== sourceId) sourceRefs.set(ref.docId, ref);
              }
            }
            if (malformed > 0) {
              console.warn('[docs-search] skipped malformed references', {
                count: malformed,
              });
            }

            return new Map(
              docIds.map(sourceId => [
                sourceId,
                Array.from(refsBySource.get(sourceId)?.values() ?? []).flatMap(
                  ref => {
                    const doc = this.docsService.list.doc$(ref.docId).value;
                    if (!doc) return [];
                    const params = omit(ref, ['docId']);
                    return [
                      {
                        title: doc.title$.value,
                        docId: doc.id,
                        params: isEmpty(params)
                          ? undefined
                          : toDocSearchParams(params),
                      },
                    ];
                  }
                ),
              ])
            );
          });
        }),
        distinctUntilChanged((previous, current) =>
          docIds.every(sourceId =>
            equalReferenceSets(
              previous.get(sourceId) ?? [],
              current.get(sourceId) ?? []
            )
          )
        )
      );
  }

  watchDatabasesTo(docId: string) {
    const DatabaseAdditionalSchema = z.object({
      databaseName: z.string().optional(),
    });
    return this.indexer
      .search$(
        'block',
        {
          type: 'boolean',
          occur: 'must',
          queries: [
            {
              type: 'match',
              field: 'refDocId',
              match: docId,
            },
            {
              type: 'match',
              field: 'parentFlavour',
              match: 'affine:database',
            },
          ],
        },
        {
          fields: ['docId', 'blockId', 'parentBlockId', 'additional'],
          pagination: {
            limit: 100,
          },
        }
      )
      .pipe(
        map(({ nodes }) => {
          return nodes
            .map(node => {
              if (node.fields.docId === docId) {
                // Ignore if it is a link to the current document.
                return null;
              }

              const additional =
                typeof node.fields.additional === 'string'
                  ? node.fields.additional
                  : node.fields.additional[0];

              return {
                docId:
                  typeof node.fields.docId === 'string'
                    ? node.fields.docId
                    : node.fields.docId[0],
                rowId:
                  typeof node.fields.blockId === 'string'
                    ? node.fields.blockId
                    : node.fields.blockId[0],
                databaseBlockId:
                  typeof node.fields.parentBlockId === 'string'
                    ? node.fields.parentBlockId
                    : node.fields.parentBlockId[0],
                databaseName: DatabaseAdditionalSchema.safeParse(additional)
                  .data?.databaseName as string | undefined,
              };
            })
            .filter((item): item is NonNullable<typeof item> => item !== null);
        })
      );
  }

  /**
   * Forward search for cross-doc reference candidates: every Frame or
   * Database block in the workspace except the ones living in `excludeDocId`
   * (the doc currently being edited — referencing a block from itself isn't
   * a cross-doc reference). Pass `null` to exclude nothing (every doc's
   * candidates included, current doc's own too) for callers that want one
   * picker covering both same-doc and cross-doc candidates. Powers the
   * cross-doc picker (Story 0.3): unlike
   * `watchDatabasesTo`, which looks for existing *references pointing at* a
   * doc, this looks for *referenceable source blocks* themselves, so it
   * queries by the block's own `flavour` rather than by `refDocId`.
   *
   * `query` matches EITHER the block's own name (frame title / database
   * name, folded into its indexed `content`) OR the title of the doc it
   * lives in — a block's own content doesn't include its containing doc's
   * title, so that's resolved via a separate `doc`-title lookup first and
   * folded into the block query as an additional `docId` match, rather than
   * denormalizing the page title into every block (which would need a
   * re-crawl of every block in a doc whenever the doc itself is renamed).
   */
  watchCrossDocReferenceCandidates(
    excludeDocId: string | null,
    query?: string,
    allowedFlavours: ('affine:frame' | 'affine:database' | 'affine:note')[] = [
      'affine:frame',
      'affine:database',
      'affine:note',
    ]
  ) {
    const DatabaseAdditionalSchema = z.object({
      databaseName: z.string().optional(),
      frameTitle: z.string().optional(),
      noteTitle: z.string().optional(),
    });

    const flavourQuery: Query<'block'> = {
      type: 'boolean',
      occur: 'should',
      queries: allowedFlavours.map(flavour => ({
        type: 'match',
        field: 'flavour',
        match: flavour,
      })),
    };

    const matchingDocIds$ = query
      ? this.indexer
          .search$(
            'doc',
            { type: 'match', field: 'title', match: query },
            { fields: ['docId'], pagination: { limit: 50 } }
          )
          .pipe(
            map(({ nodes }) =>
              nodes.map(node =>
                typeof node.fields.docId === 'string'
                  ? node.fields.docId
                  : node.fields.docId[0]
              )
            )
          )
      : of([]);

    return matchingDocIds$.pipe(
      switchMap(matchingDocIds => {
        const textQuery: Query<'block'> | undefined = query
          ? {
              type: 'boolean',
              occur: 'should',
              queries: [
                { type: 'match', field: 'content', match: query },
                // Boosted well above a loose content-token match: living
                // in a doc whose own *title* matched the query is a much
                // stronger signal than a block merely containing one of
                // the query's words somewhere in its content — without
                // this, a block in a doc titled exactly "2026-07-30" (a
                // journal) ranked no higher than any other block that
                // happened to share a single word with the query.
                ...matchingDocIds.map(
                  (docId): Query<'block'> => ({
                    type: 'boost',
                    boost: 3,
                    query: { type: 'match', field: 'docId', match: docId },
                  })
                ),
              ],
            }
          : undefined;

        return this.indexer.search$(
          'block',
          {
            type: 'boolean',
            occur: 'must',
            queries: textQuery ? [flavourQuery, textQuery] : [flavourQuery],
          },
          {
            fields: ['docId', 'blockId', 'flavour', 'additional'],
            pagination: {
              limit: 100,
            },
          }
        );
      }),
      map(({ nodes }) => {
        return nodes
          .map(node => {
            const docId =
              typeof node.fields.docId === 'string'
                ? node.fields.docId
                : node.fields.docId[0];
            if (excludeDocId !== null && docId === excludeDocId) {
              // Referencing a block from the doc currently being edited
              // isn't a cross-doc reference — the same-page picker/slash
              // menu already covers that case.
              return null;
            }

            const blockId =
              typeof node.fields.blockId === 'string'
                ? node.fields.blockId
                : node.fields.blockId[0];
            const flavour =
              typeof node.fields.flavour === 'string'
                ? node.fields.flavour
                : node.fields.flavour[0];
            const additional =
              typeof node.fields.additional === 'string'
                ? node.fields.additional
                : node.fields.additional[0];
            // A single malformed `additional` blob shouldn't take down every
            // other candidate in this batch — `.map()` aborts entirely on
            // an uncaught throw, so this one node degrades to "no label"
            // instead of discarding the whole result set.
            let parsedAdditional: unknown;
            if (additional) {
              try {
                parsedAdditional = JSON.parse(additional);
              } catch (error) {
                console.warn(
                  '[docs-search] failed to parse indexer `additional` field',
                  error
                );
              }
            }
            const parsed =
              DatabaseAdditionalSchema.safeParse(parsedAdditional).data;

            const doc = this.docsService.list.doc$(docId).value;
            if (!doc) return null;

            const label =
              flavour === 'affine:database'
                ? parsed?.databaseName
                : flavour === 'affine:frame'
                  ? parsed?.frameTitle
                  : parsed?.noteTitle;

            return {
              docId,
              docTitle: doc.title$.value,
              blockId,
              flavour: flavour as
                | 'affine:frame'
                | 'affine:database'
                | 'affine:note',
              label: label || undefined,
              // The indexer's own relevance score (BM25-based, boosted
              // above for exact containing-doc-title matches) — consumers
              // should sort by this instead of alphabetically, so an exact
              // or near-exact match actually ranks first.
              score: node.score,
            };
          })
          .filter((item): item is NonNullable<typeof item> => item !== null);
      })
    );
  }

  watchDocSummary(docId: string) {
    return this.indexer
      .search$(
        'doc',
        {
          type: 'match',
          field: 'docId',
          match: docId,
        },
        {
          fields: ['summary'],
          pagination: {
            limit: 1,
          },
        }
      )
      .pipe(
        map(({ nodes }) => {
          const node = nodes.at(0);
          return (
            (typeof node?.fields.summary === 'string'
              ? node?.fields.summary
              : node?.fields.summary[0]) ?? null
          );
        })
      );
  }
}
