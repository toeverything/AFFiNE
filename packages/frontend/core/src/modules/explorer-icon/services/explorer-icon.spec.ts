/**
 * @vitest-environment happy-dom
 */
import { IconType } from '@affine/component';
import { Framework } from '@toeverything/infra';
import { describe, expect, test, vi } from 'vitest';

import type { WorkspaceService } from '../../workspace';
import type { ExplorerIconStore } from '../store/explorer-icon';
import { ExplorerIconService } from './explorer-icon';

function createService(blobId = 'blob-id') {
  const store = { setIcon: vi.fn() };
  const blobSync = { set: vi.fn().mockResolvedValue(blobId) };
  const workspaceService = {
    workspace: { docCollection: { blobSync } },
  };
  const framework = new Framework();
  framework.service(
    ExplorerIconService,
    () =>
      new ExplorerIconService(
        store as unknown as ExplorerIconStore,
        workspaceService as unknown as WorkspaceService
      )
  );
  const service = framework.provider().get(ExplorerIconService);
  return { service, store, blobSync };
}

describe('ExplorerIconService.setIcon', () => {
  test('uploads a raw Blob and persists only its blob id', async () => {
    const { service, store, blobSync } = createService('uploaded-id');
    const blob = new Blob(['image-bytes'], { type: 'image/png' });

    await service.setIcon({ where: 'doc', id: 'doc-1', icon: blob });

    expect(blobSync.set).toHaveBeenCalledWith(blob);
    expect(store.setIcon).toHaveBeenCalledWith({
      where: 'doc',
      id: 'doc-1',
      icon: { type: IconType.Blob, blobId: 'uploaded-id' },
    });
  });

  test('passes structured icon data through without uploading', async () => {
    const { service, store, blobSync } = createService();
    const icon = { type: IconType.Emoji, unicode: '📁' } as const;

    await service.setIcon({ where: 'folder', id: 'folder-1', icon });

    expect(blobSync.set).not.toHaveBeenCalled();
    expect(store.setIcon).toHaveBeenCalledWith({
      where: 'folder',
      id: 'folder-1',
      icon,
    });
  });

  test('forwards icon removal without uploading', async () => {
    const { service, store, blobSync } = createService();

    await service.setIcon({ where: 'tag', id: 'tag-1', icon: undefined });

    expect(blobSync.set).not.toHaveBeenCalled();
    expect(store.setIcon).toHaveBeenCalledWith({
      where: 'tag',
      id: 'tag-1',
      icon: undefined,
    });
  });

  test('discards a blob upload that resolves after a later selection', async () => {
    const { service, store, blobSync } = createService();
    let resolveUpload!: (blobId: string) => void;
    blobSync.set.mockReturnValueOnce(
      new Promise<string>(resolve => {
        resolveUpload = resolve;
      })
    );
    const emoji = { type: IconType.Emoji, unicode: '📁' } as const;

    const upload = service.setIcon({
      where: 'doc',
      id: 'doc-1',
      icon: new Blob(['image-bytes']),
    });
    await service.setIcon({ where: 'doc', id: 'doc-1', icon: emoji });
    resolveUpload('stale-id');
    await upload;

    expect(store.setIcon).toHaveBeenCalledTimes(1);
    expect(store.setIcon).toHaveBeenCalledWith({
      where: 'doc',
      id: 'doc-1',
      icon: emoji,
    });
  });

  test('keeps pending uploads of other targets unaffected', async () => {
    const { service, store, blobSync } = createService();
    let resolveUpload!: (blobId: string) => void;
    blobSync.set.mockReturnValueOnce(
      new Promise<string>(resolve => {
        resolveUpload = resolve;
      })
    );

    const upload = service.setIcon({
      where: 'doc',
      id: 'doc-1',
      icon: new Blob(['image-bytes']),
    });
    await service.setIcon({
      where: 'doc',
      id: 'doc-2',
      icon: { type: IconType.Emoji, unicode: '📁' },
    });
    resolveUpload('fresh-id');
    await upload;

    expect(store.setIcon).toHaveBeenCalledWith({
      where: 'doc',
      id: 'doc-1',
      icon: { type: IconType.Blob, blobId: 'fresh-id' },
    });
  });
});
