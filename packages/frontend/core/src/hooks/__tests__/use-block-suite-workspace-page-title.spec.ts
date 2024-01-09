/**
 * @vitest-environment happy-dom
 */
import 'fake-indexeddb/auto';

import { __unstableSchemas, AffineSchemas } from '@blocksuite/blocks/models';
import { assertExists } from '@blocksuite/global/utils';
import type { Page } from '@blocksuite/store';
import { Schema, Workspace as BlockSuiteWorkspace } from '@blocksuite/store';
import { renderHook } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { beforeEach } from 'vitest';

import { useBlockSuiteWorkspacePageTitle } from '../use-block-suite-workspace-page-title';

let blockSuiteWorkspace: BlockSuiteWorkspace;

const schema = new Schema();
schema.register(AffineSchemas).register(__unstableSchemas);

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['requestIdleCallback'] });
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
