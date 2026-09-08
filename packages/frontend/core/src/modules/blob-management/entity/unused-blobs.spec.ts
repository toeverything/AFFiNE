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
});
