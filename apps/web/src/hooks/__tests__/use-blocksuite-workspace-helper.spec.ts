/**
 * @vitest-environment happy-dom
 */
import 'fake-indexeddb/auto';

import { __unstableSchemas, AffineSchemas } from '@blocksuite/blocks/models';
import type { Page } from '@blocksuite/store';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, test } from 'vitest';

import { BlockSuiteWorkspace } from '../../shared';
import { useBlockSuiteWorkspaceHelper } from '../use-blocksuite-workspace-helper';
import { usePageMeta } from '../use-page-meta';

let blockSuiteWorkspace: BlockSuiteWorkspace;

function handleNewPage(page: Page) {
  const pageBlockId = page.addBlock('affine:page', { title: '' });
  const frameId = page.addBlock('affine:frame', {}, pageBlockId);
  page.addBlock('affine:paragraph', {}, frameId);
}

beforeEach(() => {
  blockSuiteWorkspace = new BlockSuiteWorkspace({
    id: 'test',
  })
    .register(AffineSchemas)
    .register(__unstableSchemas);
  handleNewPage(blockSuiteWorkspace.createPage('page0'));
  handleNewPage(blockSuiteWorkspace.createPage('page1'));
  handleNewPage(blockSuiteWorkspace.createPage('page2'));
});

describe('useBlockSuiteWorkspaceHelper', () => {
  test('should create page', () => {
    expect(blockSuiteWorkspace.meta.pageMetas.length).toBe(3);
    const helperHook = renderHook(() =>
      useBlockSuiteWorkspaceHelper(blockSuiteWorkspace)
    );
    const pageMetaHook = renderHook(() => usePageMeta(blockSuiteWorkspace));
    expect(pageMetaHook.result.current.length).toBe(3);
    expect(blockSuiteWorkspace.meta.pageMetas.length).toBe(3);
    const page = helperHook.result.current.createPage('page4');
    expect(page.id).toBe('page4');
    expect(blockSuiteWorkspace.meta.pageMetas.length).toBe(4);
    pageMetaHook.rerender();
    expect(pageMetaHook.result.current.length).toBe(4);
  });

  test('milestone', async () => {
    expect(blockSuiteWorkspace.meta.pageMetas.length).toBe(3);
    const helperHook = renderHook(() =>
      useBlockSuiteWorkspaceHelper(blockSuiteWorkspace)
    );
    await helperHook.result.current.markMilestone('test');
    expect(blockSuiteWorkspace.meta.pageMetas.length).toBe(3);
    handleNewPage(helperHook.result.current.createPage('page4'));
    expect(blockSuiteWorkspace.meta.pageMetas.length).toBe(4);
    expect(await helperHook.result.current.listMilestone()).toHaveProperty(
      'test'
    );
    await helperHook.result.current.revertMilestone('test');
    expect(blockSuiteWorkspace.meta.pageMetas.length).toBe(3);
  });
});
