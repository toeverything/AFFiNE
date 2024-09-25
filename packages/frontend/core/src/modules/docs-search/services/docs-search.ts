import { toURLSearchParams } from '@affine/core/modules/navigation';
import type { ReferenceParams } from '@blocksuite/blocks';
import type { WorkspaceService } from '@toeverything/infra';
import {
  fromPromise,
  OnEvent,
  Service,
  WorkspaceEngineBeforeStart,
} from '@toeverything/infra';
import { isEmpty, omit } from 'lodash-es';
import { type Observable, switchMap } from 'rxjs';

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

  async search(query: string): Promise<
    {
      docId: string;
      title: string;
      score: number;
      blockId?: string;
      blockContent?: string;
    }[]
  > {
    const { buckets } = await this.indexer.blockIndex.aggregate(
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
    );

    const docData = await this.indexer.docIndex.getAll(
      buckets.map(bucket => bucket.key)
    );

    const result = [];

    for (const bucket of buckets) {
      const firstMatchFlavour = bucket.hits.nodes[0]?.fields.flavour;
      if (firstMatchFlavour === 'affine:page') {
        // is title match
        const blockContent = bucket.hits.nodes[1]?.highlights.content[0]; // try to get block content
        result.push({
          docId: bucket.key,
          title: bucket.hits.nodes[0].highlights.content[0],
          score: bucket.score,
          blockContent,
        });
      } else {
        const title =
          docData.find(doc => doc.id === bucket.key)?.get('title') ?? '';
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

  async searchRefsFrom(docId: string): Promise<
    {
      docId: string;
      title: string;
    }[]
  > {
    const { nodes } = await this.indexer.blockIndex.search(
      {
        type: 'boolean',
        occur: 'must',
        queries: [
          {
            type: 'match',
            field: 'docId',
            match: docId,
          },
          // Ignore if it is a link to the current document.
          {
            type: 'boolean',
            occur: 'must_not',
            queries: [
              {
                type: 'match',
                field: 'refDocId',
                match: docId,
              },
            ],
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
    );

    const refs: ({ docId: string } & ReferenceParams)[] = nodes.flatMap(
      node => {
        const { ref } = node.fields;
        return typeof ref === 'string'
          ? [JSON.parse(ref)]
          : ref.map(item => JSON.parse(item));
      }
    );

    const docData = await this.indexer.docIndex.getAll(
      Array.from(new Set(refs.map(ref => ref.docId)))
    );

    return refs
      .flatMap(ref => {
        const doc = docData.find(doc => doc.id === ref.docId);
        if (!doc) return null;

        const titles = doc.get('title');
        const title = (Array.isArray(titles) ? titles[0] : titles) ?? '';
        const params = omit(ref, ['docId']);

        return {
          title,
          docId: doc.id,
          params: isEmpty(params) ? undefined : toURLSearchParams(params),
        };
      })
      .filter(ref => !!ref);
  }

  watchRefsFrom(docId: string) {
    return this.indexer.blockIndex
      .search$(
        {
          type: 'boolean',
          occur: 'must',
          queries: [
            {
              type: 'match',
              field: 'docId',
              match: docId,
            },
            // Ignore if it is a link to the current document.
            {
              type: 'boolean',
              occur: 'must_not',
              queries: [
                {
                  type: 'match',
                  field: 'refDocId',
                  match: docId,
                },
              ],
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
            const refs: ({ docId: string } & ReferenceParams)[] = nodes.flatMap(
              node => {
                const { ref } = node.fields;
                return typeof ref === 'string'
                  ? [JSON.parse(ref)]
                  : ref.map(item => JSON.parse(item));
              }
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

  async searchRefsTo(docId: string): Promise<
    {
      docId: string;
      blockId: string;
      title: string;
    }[]
  > {
    const { buckets } = await this.indexer.blockIndex.aggregate(
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
          fields: ['docId', 'blockId'],
          pagination: {
            limit: 1,
          },
        },
        pagination: {
          limit: 100,
        },
      }
    );

    const docData = await this.indexer.docIndex.getAll(
      buckets.map(bucket => bucket.key)
    );

    return buckets.map(bucket => {
      const title =
        docData.find(doc => doc.id === bucket.key)?.get('title') ?? '';
      const blockId = bucket.hits.nodes[0]?.fields.blockId ?? '';
      return {
        docId: bucket.key,
        blockId: typeof blockId === 'string' ? blockId : blockId[0],
        title: typeof title === 'string' ? title : title[0],
      };
    });
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
            fields: ['docId', 'blockId'],
            pagination: {
              limit: 1,
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

            return buckets.map(bucket => {
              const title =
                docData.find(doc => doc.id === bucket.key)?.get('title') ?? '';
              const blockId = bucket.hits.nodes[0]?.fields.blockId ?? '';
              return {
                docId: bucket.key,
                blockId: typeof blockId === 'string' ? blockId : blockId[0],
                title: typeof title === 'string' ? title : title[0],
              };
            });
          });
        })
      );
  }

  async getDocTitle(docId: string) {
    const doc = await this.indexer.docIndex.get(docId);
    const title = doc?.get('title');
    return typeof title === 'string' ? title : title?.[0];
  }

  override dispose(): void {
    this.indexer.dispose();
  }
}
