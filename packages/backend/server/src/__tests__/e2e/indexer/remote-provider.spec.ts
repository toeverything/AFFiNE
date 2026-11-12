import {
  deleteWorkspaceMutation,
  indexerAggregateQuery,
  SearchQueryType,
  SearchTable,
} from '@affine/graphql';
import { PrismaClient } from '@prisma/client';

import { ServerService } from '../../../core/config';
import { createDocWithMarkdown } from '../../../native';
import { Mockers } from '../../mocks';
import {
  addDocumentToRoot,
  app,
  e2e,
  reconcileSearchProjection,
} from '../test';

const indexer = (await app.get(ServerService).getEffectiveAdminConfig())
  .indexer;
const remoteE2e =
  indexer?.enabled && indexer.provider?.type === 'elasticsearch'
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
  'aggregates remote documents and removes workspace projections after deletion',
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

    const [generation] = await app.get(PrismaClient).$queryRaw<
      { manifest: Record<string, string> }[]
    >`SELECT manifest FROM search_projection.generations WHERE state = 'active'`;
    const provider = indexer!.provider!;
    const countWorkspaceRows = async () => {
      return await Promise.all(
        ['doc', 'block'].map(async table => {
          const response = await fetch(
            new URL(
              `${generation.manifest[table]}/_count`,
              `${provider.endpoint}/`
            ),
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(provider.apiKey
                  ? { Authorization: `ApiKey ${provider.apiKey}` }
                  : provider.username
                    ? {
                        Authorization: `Basic ${Buffer.from(
                          `${provider.username}:${provider.password}`
                        ).toString('base64')}`,
                      }
                    : {}),
              },
              body: JSON.stringify({
                query: { term: { workspace_id: workspace.id } },
              }),
            }
          );
          t.is(response.status, 200);
          const body = (await response.json()) as { count: number };
          return body.count;
        })
      );
    };
    t.true((await countWorkspaceRows()).every(count => count > 0));
    await app.gql({
      query: deleteWorkspaceMutation,
      variables: { id: workspace.id },
    });
    await reconcileSearchProjection();
    t.deepEqual(await countWorkspaceRows(), [0, 0]);
  }
);
