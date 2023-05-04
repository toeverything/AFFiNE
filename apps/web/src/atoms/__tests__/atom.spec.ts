/**
 * @vitest-environment happy-dom
 */
import 'fake-indexeddb/auto';

import { initPage } from '@affine/env/blocksuite';
import {
  rootCurrentWorkspaceIdAtom,
  rootWorkspacesMetadataAtom,
} from '@affine/workspace/atom';
import { createIndexedDBDownloadProvider } from '@affine/workspace/providers';
import { WorkspaceFlavour } from '@affine/workspace/type';
import {
  _cleanupBlockSuiteWorkspaceCache,
  createEmptyBlockSuiteWorkspace,
} from '@affine/workspace/utils';
import type { ParagraphBlockModel } from '@blocksuite/blocks/models';
import type { Page } from '@blocksuite/store';
import { createStore } from 'jotai';
import { describe, expect, test } from 'vitest';

import { WorkspacePlugins } from '../../plugins';
import { rootCurrentWorkspaceAtom } from '../root';

describe('currentWorkspace atom', () => {
  test('should be defined', async () => {
    const store = createStore();
    let id: string;
    {
      const workspace = createEmptyBlockSuiteWorkspace(
        'test',
        WorkspaceFlavour.LOCAL
      );
      const page = workspace.createPage({ id: 'page0' });
      initPage(page);
      const frameId = page.getBlockByFlavour('affine:frame').at(0)
        ?.id as string;
      id = page.addBlock(
        'affine:paragraph',
        {
          text: new page.Text('test 1'),
        },
        frameId
      );
      const provider = createIndexedDBDownloadProvider(workspace);
      provider.sync();
      await provider.whenReady;
      const workspaceId = await WorkspacePlugins[
        WorkspaceFlavour.LOCAL
      ].CRUD.create(workspace);
      store.set(rootWorkspacesMetadataAtom, [
        {
          id: workspaceId,
          flavour: WorkspaceFlavour.LOCAL,
        },
      ]);
      _cleanupBlockSuiteWorkspaceCache();
    }
    store.set(
      rootCurrentWorkspaceIdAtom,
      store.get(rootWorkspacesMetadataAtom)[0].id
    );
    const workspace = await store.get(rootCurrentWorkspaceAtom);
    expect(workspace).toBeDefined();
    const page = workspace.blockSuiteWorkspace.getPage('page0') as Page;
    expect(page).not.toBeNull();
    const paragraphBlock = page.getBlockById(id) as ParagraphBlockModel;
    expect(paragraphBlock).not.toBeNull();
    expect(paragraphBlock.text.toString()).toBe('test 1');
  });
});
