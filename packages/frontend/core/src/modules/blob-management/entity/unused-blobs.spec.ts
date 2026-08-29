/** @vitest-environment happy-dom */

import { Framework } from '@toeverything/infra';
import { describe, expect, it, vi } from 'vitest';

import { DocsSearchService } from '../../docs-search';
import { WorkspaceService } from '../../workspace';
import { WorkspaceFlavoursService } from '../../workspace/services/flavours';
import { UnusedBlobs } from './unused-blobs';

describe('UnusedBlobs', () => {
  it('reads every used blob page from the local index', async () => {
    const aggregate = vi
      .fn()
      .mockResolvedValueOnce({
        pagination: { hasMore: true },
        buckets: [{ key: 'used-1' }],
      })
      .mockResolvedValueOnce({
        pagination: { hasMore: false },
        buckets: [{ key: 'used-2' }],
      });
    const flavoursService = {
      flavours$: {
        value: [
          {
            flavour: 'local',
            listBlobs: vi
              .fn()
              .mockResolvedValue([
                { key: 'used-1' },
                { key: 'used-2' },
                { key: 'unused' },
              ]),
          },
        ],
      },
    };
    const workspaceService = {
      workspace: {
        id: 'workspace',
        flavour: 'local',
        avatar$: { value: null },
        engine: { doc: { waitForSynced: vi.fn() } },
      },
    };
    const docsSearchService = {
      indexer: { aggregate, waitForCompleted: vi.fn() },
    };
    const framework = new Framework();
    framework
      .service(
        WorkspaceFlavoursService,
        flavoursService as unknown as WorkspaceFlavoursService
      )
      .service(
        WorkspaceService,
        workspaceService as unknown as WorkspaceService
      )
      .service(
        DocsSearchService,
        docsSearchService as unknown as DocsSearchService
      )
      .entity(UnusedBlobs, [
        WorkspaceFlavoursService,
        WorkspaceService,
        DocsSearchService,
      ]);
    const entity = framework.provider().createEntity(UnusedBlobs);

    await expect(entity.getUnusedBlobs()).resolves.toEqual([{ key: 'unused' }]);
    expect(aggregate).toHaveBeenCalledTimes(2);
    expect(aggregate.mock.calls.map(call => call[3])).toEqual([
      { pagination: { limit: 1000, skip: 0 }, prefer: 'local' },
      { pagination: { limit: 1000, skip: 1000 }, prefer: 'local' },
    ]);
  });

  it('lists details only after the bookmark reference is removed and indexing completes', async () => {
    const aggregate = vi
      .fn()
      .mockResolvedValueOnce({
        pagination: { hasMore: false },
        buckets: [{ key: 'details-blob' }],
      })
      .mockResolvedValueOnce({
        pagination: { hasMore: false },
        buckets: [],
      });
    const waitForSynced = vi.fn();
    const waitForCompleted = vi.fn();
    const framework = new Framework();
    framework
      .service(WorkspaceFlavoursService, {
        flavours$: {
          value: [
            {
              flavour: 'local',
              listBlobs: vi.fn().mockResolvedValue([{ key: 'details-blob' }]),
            },
          ],
        },
      } as unknown as WorkspaceFlavoursService)
      .service(WorkspaceService, {
        workspace: {
          id: 'workspace',
          flavour: 'local',
          avatar$: { value: null },
          engine: { doc: { waitForSynced } },
        },
      } as unknown as WorkspaceService)
      .service(DocsSearchService, {
        indexer: { aggregate, waitForCompleted },
      } as unknown as DocsSearchService)
      .entity(UnusedBlobs, [
        WorkspaceFlavoursService,
        WorkspaceService,
        DocsSearchService,
      ]);
    const entity = framework.provider().createEntity(UnusedBlobs);

    await expect(entity.getUnusedBlobs()).resolves.toEqual([]);
    await expect(entity.getUnusedBlobs()).resolves.toEqual([
      { key: 'details-blob' },
    ]);
    expect(waitForSynced).toHaveBeenCalledTimes(2);
    expect(waitForCompleted).toHaveBeenCalledTimes(2);
    expect(waitForCompleted.mock.invocationCallOrder[0]).toBeLessThan(
      aggregate.mock.invocationCallOrder[0]
    );
    expect(waitForCompleted.mock.invocationCallOrder[1]).toBeLessThan(
      aggregate.mock.invocationCallOrder[1]
    );
  });
});
