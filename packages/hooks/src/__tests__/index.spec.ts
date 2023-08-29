/**
 * @vitest-environment happy-dom
 */
import 'fake-indexeddb/auto';

import { __unstableSchemas, AffineSchemas } from '@blocksuite/blocks/models';
import { assertExists } from '@blocksuite/global/utils';
import type { Page } from '@blocksuite/store';
import { Schema, Workspace as BlockSuiteWorkspace } from '@blocksuite/store';
import { renderHook } from '@testing-library/react';
import { useAtomValue } from 'jotai';
import { describe, expect, test } from 'vitest';
import { beforeEach } from 'vitest';

import { useBlockSuitePagePreview } from '../use-block-suite-page-preview';
import { useBlockSuiteWorkspaceName } from '../use-block-suite-workspace-name';
import { useBlockSuiteWorkspacePageTitle } from '../use-block-suite-workspace-page-title';

let blockSuiteWorkspace: BlockSuiteWorkspace;

const schema = new Schema();
schema.register(AffineSchemas).register(__unstableSchemas);

beforeEach(async () => {
  blockSuiteWorkspace = new BlockSuiteWorkspace({ id: 'test', schema });
  const initPage = async (page: Page) => {
    await page.waitForLoaded();
    expect(page).not.toBeNull();
    assertExists(page);
    const pageBlockId = page.addBlock('affine:page', {
      title: new page.Text(''),
    });
    const frameId = page.addBlock('affine:note', {}, pageBlockId);
    page.addBlock('affine:paragraph', {}, frameId);
  };
  await initPage(blockSuiteWorkspace.createPage({ id: 'page0' }));
  await initPage(blockSuiteWorkspace.createPage({ id: 'page1' }));
  await initPage(blockSuiteWorkspace.createPage({ id: 'page2' }));
});

describe('useBlockSuiteWorkspaceName', () => {
  test('basic', async () => {
    blockSuiteWorkspace.meta.setName('test 1');
    const workspaceNameHook = renderHook(() =>
      useBlockSuiteWorkspaceName(blockSuiteWorkspace)
    );
    expect(workspaceNameHook.result.current[0]).toBe('test 1');
    blockSuiteWorkspace.meta.setName('test 2');
    workspaceNameHook.rerender();
    expect(workspaceNameHook.result.current[0]).toBe('test 2');
    workspaceNameHook.result.current[1]('test 3');
    expect(blockSuiteWorkspace.meta.name).toBe('test 3');
  });
});

describe('useBlockSuiteWorkspacePageTitle', () => {
  test('basic', async () => {
    const pageTitleHook = renderHook(() =>
      useBlockSuiteWorkspacePageTitle(blockSuiteWorkspace, 'page0')
    );
    expect(pageTitleHook.result.current).toBe('Untitled');
    blockSuiteWorkspace.setPageMeta('page0', { title: '1' });
    pageTitleHook.rerender();
    expect(pageTitleHook.result.current).toBe('1');
  });
});

describe('useBlockSuitePagePreview', () => {
  test('basic', async () => {
    const page = blockSuiteWorkspace.getPage('page0') as Page;
    const id = page.addBlock(
      'affine:paragraph',
      {
        text: new page.Text('Hello, world!'),
      },
      page.getBlockByFlavour('affine:note')[0].id
    );
    const hook = renderHook(() => useAtomValue(useBlockSuitePagePreview(page)));
    expect(hook.result.current).toBe('\nHello, world!');
    page.transact(() => {
      page.getBlockById(id)!.text!.insert('Test', 0);
    });
    await new Promise(resolve => setTimeout(resolve, 100));
    hook.rerender();
    expect(hook.result.current).toBe('\nTestHello, world!');
  });
});
