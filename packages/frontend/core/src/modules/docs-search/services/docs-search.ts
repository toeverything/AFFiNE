import { toURLSearchParams } from '@affine/core/modules/navigation';
import type { ReferenceParams } from '@blocksuite/affine/model';
import { fromPromise, OnEvent, Service } from '@toeverything/infra';
import { isEmpty, omit } from 'lodash-es';
import { map, type Observable, of, switchMap } from 'rxjs';
import { z } from 'zod';

import type { WorkspaceService } from '../../workspace';
import { WorkspaceEngineBeforeStart } from '../../workspace';
import { DocsIndexer } from '../entities/docs-indexer';

@OnEvent(WorkspaceEngineBeforeStart, s => s.handleWorkspaceEngineBeforeStart)
export class DocsSearchService extends Service {
  readonly indexer = this.framework.createEntity(DocsIndexer);

  constructor(private readonly workspaceService: WorkspaceService) {
    super();
  }

  handleWorkspaceEngineBeforeStart() {
    // skip if in shared mode
    if (this.workspaceService.workspace.openOptions.isSharedMode) {
      return;
    }
    this.indexer.setupListener();
    this.indexer.startCrawling();
  }

  search$(query: string): Observable<
    {
      docId: string;
      title: string;
      score: number;
      blockId?: string;
      blockContent?: string;
    }[]
  > {
    return this.indexer.blockIndex
      .aggregate$(
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
                  type: 'all',
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
        }
      )
      .pipe(
        switchMap(({ buckets }) => {
          return fromPromise(async () => {
            const docData = await this.indexer.docIndex.getAll(
              buckets.map(bucket => bucket.key)
            );

            const result = [];

            for (const bucket of buckets) {
              const firstMatchFlavour = bucket.hits.nodes[0]?.fields.flavour;
              if (firstMatchFlavour === 'affine:page') {
                // is title match
                const blockContent =
                  bucket.hits.nodes[1]?.highlights.content[0]; // try to get block content
                result.push({
                  docId: bucket.key,
                  title: bucket.hits.nodes[0].highlights.content[0],
                  score: bucket.score,
                  blockContent,
                });
              } else {
                const title =
                  docData.find(doc => doc.id === bucket.key)?.get('title') ??
                  '';
                const matchedBlockId = bucket.hits.nodes[0]?.fields.blockId;
                // is block match
                result.push({
                  docId: bucket.key,
                  title: typeof title === 'string' ? title : title[0],
                  blockId:
                    typeof matchedBlockId === 'string'
                      ? matchedBlockId
                      : matchedBlockId[0],
                  score: bucket.score,
                  blockContent: bucket.hits.nodes[0]?.highlights.content[0],
                });
              }
            }

            return result;
          });
        })
      );
  }

  watchRefsFrom(ids: string | string[]) {
    const docIds = Array.isArray(ids) ? ids : [ids];
    if (docIds.length === 0) {
      return of([]);
    }

    return this.indexer.blockIndex
      .search$(
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

            const docData = await this.indexer.docIndex.getAll(
              Array.from(new Set(refs.map(ref => ref.docId)))
            );

            return refs
              .flatMap(ref => {
                const doc = docData.find(doc => doc.id === ref.docId);
                if (!doc) return null;

                const titles = doc.get('title');
                const title =
                  (Array.isArray(titles) ? titles[0] : titles) ?? '';
                const params = omit(ref, ['docId']);

                return {
                  title,
                  docId: doc.id,
                  params: isEmpty(params)
                    ? undefined
                    : toURLSearchParams(params),
                };
              })
              .filter(ref => !!ref);
          });
        })
      );
  }

  watchRefsTo(docId: string) {
    return this.indexer.blockIndex
      .aggregate$(
        {
          type: 'boolean',
          occur: 'must',
          queries: [
            {
              type: 'match',
              field: 'refDocId',
              match: docId,
            },
            // Ignore if it is a link to the current document.
            {
              type: 'boolean',
              occur: 'must_not',
              queries: [
                {
                  type: 'match',
                  field: 'docId',
                  match: docId,
                },
              ],
            },
          ],
        },
        'docId',
        {
          hits: {
            fields: [
              'docId',
              'blockId',
              'parentBlockId',
              'parentFlavour',
              'additional',
              'markdownPreview',
            ],
            pagination: {
              limit: 5, // the max number of backlinks to show for each doc
            },
          },
          pagination: {
            limit: 100,
          },
        }
      )
      .pipe(
        switchMap(({ buckets }) => {
          return fromPromise(async () => {
            const docData = await this.indexer.docIndex.getAll(
              buckets.map(bucket => bucket.key)
            );

            return buckets.flatMap(bucket => {
              const title =
                docData.find(doc => doc.id === bucket.key)?.get('title') ?? '';

              return bucket.hits.nodes.map(node => {
                const blockId = node.fields.blockId ?? '';
                const markdownPreview = node.fields.markdownPreview ?? '';
                const additional =
                  typeof node.fields.additional === 'string'
                    ? node.fields.additional
                    : node.fields.additional[0];

                const additionalData: {
                  displayMode?: string;
                  noteBlockId?: string;
                } = JSON.parse(additional || '{}');

                const displayMode = additionalData.displayMode ?? '';
                const noteBlockId = additionalData.noteBlockId ?? '';
                const parentBlockId =
                  typeof node.fields.parentBlockId === 'string'
                    ? node.fields.parentBlockId
                    : node.fields.parentBlockId[0];
                const parentFlavour =
                  typeof node.fields.parentFlavour === 'string'
                    ? node.fields.parentFlavour
                    : node.fields.parentFlavour[0];

                return {
                  docId: bucket.key,
                  blockId: typeof blockId === 'string' ? blockId : blockId[0],
                  title: typeof title === 'string' ? title : title[0],
                  markdownPreview:
                    typeof markdownPreview === 'string'
                      ? markdownPreview
                      : markdownPreview[0],
                  displayMode:
                    typeof displayMode === 'string'
                      ? displayMode
                      : displayMode[0],
                  noteBlockId:
                    typeof noteBlockId === 'string'
                      ? noteBlockId
                      : noteBlockId[0],
                  parentBlockId:
                    typeof parentBlockId === 'string'
                      ? parentBlockId
                      : parentBlockId[0],
                  parentFlavour:
                    typeof parentFlavour === 'string'
                      ? parentFlavour
                      : parentFlavour[0],
                };
              });
            });
          });
        })
      );
  }

  watchDatabasesTo(docId: string) {
    const DatabaseAdditionalSchema = z.object({
      databaseName: z.string().optional(),
    });
    return this.indexer.blockIndex
      .search$(
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
            // Ignore if it is a link to the current document.
            {
              type: 'boolean',
              occur: 'must_not',
              queries: [
                {
                  type: 'match',
                  field: 'docId',
                  match: docId,
                },
              ],
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
          return nodes.map(node => {
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
              databaseName: DatabaseAdditionalSchema.safeParse(additional).data
                ?.databaseName as string | undefined,
            };
          });
        })
      );
  }

  watchDocSummary(docId: string) {
    return this.indexer.docIndex
      .search$(
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

  override dispose(): void {
    this.indexer.dispose();
  }
}
