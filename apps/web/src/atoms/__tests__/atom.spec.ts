/**
 * @vitest-environment happy-dom
 */
import 'fake-indexeddb/auto';

import { initEmptyPage } from '@affine/env/blocksuite';
import type {
  LocalIndexedDBBackgroundProvider,
  WorkspaceAdapter,
} from '@affine/env/workspace';
import { WorkspaceFlavour, WorkspaceVersion } from '@affine/env/workspace';
import {
  rootCurrentWorkspaceIdAtom,
  rootWorkspacesMetadataAtom,
  workspaceAdaptersAtom,
} from '@affine/workspace/atom';
import { createIndexedDBBackgroundProvider } from '@affine/workspace/providers';
import {
  _cleanupBlockSuiteWorkspaceCache,
  createEmptyBlockSuiteWorkspace,
} from '@affine/workspace/utils';
import type { ParagraphBlockModel } from '@blocksuite/blocks/models';
import type { Page } from '@blocksuite/store';
import { createStore } from 'jotai';
import { describe, expect, test } from 'vitest';

import { WorkspaceAdapters } from '../../adapters/workspace';
import {
  pageSettingFamily,
  pageSettingsAtom,
  recentPageSettingsAtom,
} from '../index';
import { rootCurrentWorkspaceAtom } from '../root';

describe('page mode atom', () => {
  test('basic', () => {
    const store = createStore();
    const page0SettingAtom = pageSettingFamily('page0');
    store.set(page0SettingAtom, {
      mode: 'page',
    });

    expect(store.get(pageSettingsAtom)).toEqual({
      page0: {
        mode: 'page',
      },
    });

    expect(store.get(recentPageSettingsAtom)).toEqual([
      {
        id: 'page0',
        mode: 'page',
      },
    ]);

    const page1SettingAtom = pageSettingFamily('page1');
    store.set(page1SettingAtom, {
      mode: 'edgeless',
    });
    expect(store.get(recentPageSettingsAtom)).toEqual([
      { id: 'page1', mode: 'edgeless' },
      { id: 'page0', mode: 'page' },
    ]);
  });
});

describe('currentWorkspace atom', () => {
  test('should be defined', async () => {
    const store = createStore();
    store.set(
      workspaceAdaptersAtom,
      WorkspaceAdapters as Record<
        WorkspaceFlavour,
        WorkspaceAdapter<WorkspaceFlavour>
      >
    );
    let id: string;
    {
      const workspace = createEmptyBlockSuiteWorkspace(
        'test',
        WorkspaceFlavour.LOCAL
      );
      const page = workspace.createPage({ id: 'page0' });
      await initEmptyPage(page);
      const frameId = page.getBlockByFlavour('affine:note').at(0)?.id as string;
      id = page.addBlock(
        'affine:paragraph',
        {
          text: new page.Text('test 1'),
        },
        frameId
      );
      const provider = createIndexedDBBackgroundProvider(
        workspace.id,
        workspace.doc,
        {
          awareness: workspace.awarenessStore.awareness,
        }
      ) as LocalIndexedDBBackgroundProvider;
      provider.connect();
      await new Promise(resolve => setTimeout(resolve, 1000));
      provider.disconnect();
      const workspaceId = await WorkspaceAdapters[
        WorkspaceFlavour.LOCAL
      ].CRUD.create(workspace);
      await store.set(rootWorkspacesMetadataAtom, [
        {
          id: workspaceId,
          flavour: WorkspaceFlavour.LOCAL,
          version: WorkspaceVersion.SubDoc,
        },
      ]);
      _cleanupBlockSuiteWorkspaceCache();
    }
    store.set(
      rootCurrentWorkspaceIdAtom,
      (await store.get(rootWorkspacesMetadataAtom))[0].id
    );
    const workspace = await store.get(rootCurrentWorkspaceAtom);
    expect(workspace).toBeDefined();
    const page = workspace.blockSuiteWorkspace.getPage('page0') as Page;
    await page.waitForLoaded();
    expect(page).not.toBeNull();
    const paragraphBlock = page.getBlockById(id) as ParagraphBlockModel;
    expect(paragraphBlock).not.toBeNull();
    expect(paragraphBlock.text.toString()).toBe('test 1');
  });
});
