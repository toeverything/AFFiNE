import {
  indexerAggregateQuery,
  SearchQueryType,
  SearchTable,
} from '@affine/graphql';

import { Config } from '../../../base';
import { createDocWithMarkdown } from '../../../native';
import { Mockers } from '../../mocks';
import {
  addDocumentToRoot,
  app,
  e2e,
  reconcileSearchProjection,
} from '../test';

const indexer = app.get(Config).indexer;
const remoteE2e =
  indexer.enabled && indexer.provider.type === 'elasticsearch'
    ? e2e.serial
    : e2e.skip;

async function indexDocument(
  workspaceId: string,
  user: { id: string },
  docId: string,
  markdown: string
) {
  await app.create(Mockers.DocMeta, { workspaceId, docId });
  await addDocumentToRoot(workspaceId, docId);
  await app.create(Mockers.DocSnapshot, {
    workspaceId,
    docId,
    user,
    blob: createDocWithMarkdown(docId, markdown, docId),
  });
  await reconcileSearchProjection();
}

remoteE2e(
  'exposes remote aggregation through the GraphQL contract',
  async t => {
    const owner = await app.signup();
    const workspace = await app.create(Mockers.Workspace, {
      owner,
      snapshot: true,
    });
    const suffix = Date.now();
    for (const index of [0, 1, 2]) {
      await indexDocument(
        workspace.id,
        owner,
        `remote-aggregate-${suffix}-${index}`,
        `remote aggregate marker ${index}`
      );
    }

    const result = await app.gql({
      query: indexerAggregateQuery,
      variables: {
        id: workspace.id,
        input: {
          table: SearchTable.block,
          query: {
            type: SearchQueryType.match,
            field: 'content',
            match: 'remote aggregate marker',
          },
          field: 'docId',
          options: {
            pagination: { limit: 2, skip: 0 },
            hits: {
              pagination: { limit: 1, skip: 0 },
              fields: ['docId', 'blockId'],
            },
          },
        },
      },
    });

    t.is(result.workspace.aggregate.buckets.length, 2);
    t.is(result.workspace.aggregate.pagination.count, 2);
    t.true(result.workspace.aggregate.pagination.hasMore);
  }
);
