import {
  OnEvent,
  Service,
  WorkspaceEngineBeforeStart,
} from '@toeverything/infra';

import { DocsIndexer } from '../entities/docs-indexer';

@OnEvent(WorkspaceEngineBeforeStart, s => s.handleWorkspaceEngineBeforeStart)
export class DocsSearchService extends Service {
  private readonly indexer = this.framework.createEntity(DocsIndexer);

  handleWorkspaceEngineBeforeStart() {
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
                boost: 100,
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

  async getDocTitle(docId: string) {
    const doc = await this.indexer.docIndex.get(docId);
    const title = doc?.get('title');
    return typeof title === 'string' ? title : title?.[0];
  }
}
