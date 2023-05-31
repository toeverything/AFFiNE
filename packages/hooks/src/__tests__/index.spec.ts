/**
 * @vitest-environment happy-dom
 */
import 'fake-indexeddb/auto';

import { UNTITLED_WORKSPACE_NAME } from '@affine/env';
import { __unstableSchemas, AffineSchemas } from '@blocksuite/blocks/models';
import type { Page } from '@blocksuite/store';
import { assertExists } from '@blocksuite/store';
import { Workspace as BlockSuiteWorkspace } from '@blocksuite/store';
import { renderHook } from '@testing-library/react';
import { useBlockSuitePagePreview } from '@toeverything/hooks/use-block-suite-page-preview';
import { useBlockSuiteWorkspacePageIsPublic } from '@toeverything/hooks/use-block-suite-workspace-page-is-public';
import { useBlockSuiteWorkspacePageTitle } from '@toeverything/hooks/use-block-suite-workspace-page-title';
import { useAtomValue } from 'jotai';
import { describe, expect, test, vitest } from 'vitest';
import { beforeEach } from 'vitest';

import { useBlockSuiteWorkspaceName } from '../use-block-suite-workspace-name';

let blockSuiteWorkspace: BlockSuiteWorkspace;

beforeEach(async () => {
  blockSuiteWorkspace = new BlockSuiteWorkspace({ id: 'test' })
    .register(AffineSchemas)
    .register(__unstableSchemas);
  const initPage = (page: Page) => {
    expect(page).not.toBeNull();
    assertExists(page);
    const pageBlockId = page.addBlock('affine:page', {
      title: new page.Text(''),
    });
    const frameId = page.addBlock('affine:frame', {}, pageBlockId);
    page.addBlock('affine:paragraph', {}, frameId);
  };
  initPage(blockSuiteWorkspace.createPage({ id: 'page0' }));
  initPage(blockSuiteWorkspace.createPage({ id: 'page1' }));
  initPage(blockSuiteWorkspace.createPage({ id: 'page2' }));
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

  test('null', () => {
    const workspaceNameHook = renderHook(() =>
      useBlockSuiteWorkspaceName(null)
    );
    vitest.spyOn(globalThis.console, 'warn');
    expect(workspaceNameHook.result.current[0]).toBe(UNTITLED_WORKSPACE_NAME);
    workspaceNameHook.result.current[1]('test');
    expect(globalThis.console.warn).toHaveBeenCalledTimes(2);
    expect(workspaceNameHook.result.current[0]).toBe(UNTITLED_WORKSPACE_NAME);
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

describe('useBlockSuiteWorkspacePageIsPublic', () => {
  test('basic', async () => {
    const page = blockSuiteWorkspace.getPage('page0') as Page;
    expect(page).not.toBeNull();
    const hook = renderHook(() => useBlockSuiteWorkspacePageIsPublic(page));
    expect(hook.result.current[0]).toBe(false);
    hook.result.current[1](true);
    expect(page.meta.isPublic).toBe(true);
    hook.rerender();
    expect(hook.result.current[0]).toBe(true);
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
      page.getBlockByFlavour('affine:frame')[0].id
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
