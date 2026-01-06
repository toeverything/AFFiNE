import { toDocSearchParams } from '@affine/core/modules/navigation';
import type { IndexerPreferOptions, IndexerSyncState } from '@affine/nbstore';
import type { ReferenceParams } from '@blocksuite/affine/model';
import { fromPromise, LiveData, Service } from '@toeverything/infra';
import { isEmpty, omit } from 'lodash-es';
import { map, type Observable, of, switchMap } from 'rxjs';
import { z } from 'zod';

import type { DocsService } from '../../doc/services/docs';
import type { WorkspaceService } from '../../workspace';

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

  private normalizeHighlight(value?: string | null) {
    if (!value) {
      return value ?? '';
    }
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.join(' ');
      }
      if (typeof parsed === 'string') {
        return parsed;
      }
    } catch {
      // ignore parse errors, return raw value
    }
    return value;
  }

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
              const blockContent = this.normalizeHighlight(
                bucket.hits.nodes[1]?.highlights.content[0]
              ); // try to get block content
              result.push({
                docId: bucket.key,
                title: this.normalizeHighlight(
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
                blockContent: this.normalizeHighlight(
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
          fields: ['refDocId', 'ref'],
          pagination: {
            limit: 100,
          },
        }
      )
      .pipe(
        switchMap(({ nodes }) => {
          return fromPromise(async () => {
            const refs: ({ docId: string } & ReferenceParams)[] = Array.from(
              new Map(
                nodes
                  .flatMap(node => {
                    const { ref } = node.fields;
                    return typeof ref === 'string'
                      ? [JSON.parse(ref)]
                      : ref.map(item => JSON.parse(item));
                  })
                  .filter(ref => !docIds.includes(ref.docId))
                  .map(ref => [ref.docId, ref])
              ).values()
            );

            return refs
              .flatMap(ref => {
                const doc = this.docsService.list.doc$(ref.docId).value;
                if (!doc) return null;

                const title = doc.title$.value;
                const params = omit(ref, ['docId']);

                return {
                  title,
                  docId: doc.id,
                  params: isEmpty(params)
                    ? undefined
                    : toDocSearchParams(params),
                };
              })
              .filter(ref => !!ref);
          });
        })
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
