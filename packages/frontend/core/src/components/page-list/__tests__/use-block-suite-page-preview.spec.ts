/**
 * @vitest-environment happy-dom
 */
import 'fake-indexeddb/auto';

import { AffineSchemas } from '@blocksuite/blocks/schemas';
import { assertExists } from '@blocksuite/global/utils';
import type { Doc } from '@blocksuite/store';
import { Schema, Workspace as BlockSuiteWorkspace } from '@blocksuite/store';
import { renderHook } from '@testing-library/react';
import { useAtomValue } from 'jotai';
import { describe, expect, test, vi } from 'vitest';
import { beforeEach } from 'vitest';

import { useBlockSuitePagePreview } from '../use-block-suite-page-preview';
let blockSuiteWorkspace: BlockSuiteWorkspace;

const schema = new Schema();
schema.register(AffineSchemas);

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['requestIdleCallback'] });
  blockSuiteWorkspace = new BlockSuiteWorkspace({ id: 'test', schema });
  const initPage = async (page: Doc) => {
    page.load();
    expect(page).not.toBeNull();
    assertExists(page);
    const pageBlockId = page.addBlock('affine:page', {
      title: new page.Text(''),
    });
    const frameId = page.addBlock('affine:note', {}, pageBlockId);
    page.addBlock('affine:paragraph', {}, frameId);
  };
  await initPage(blockSuiteWorkspace.createDoc({ id: 'page0' }));
});

describe('useBlockSuitePagePreview', () => {
  test('basic', async () => {
    const page = blockSuiteWorkspace.getDoc('page0') as Doc;
    const id = page.addBlock(
      'affine:paragraph',
      {
        text: new page.Text('Hello, world!'),
      },
      page.getBlockByFlavour('affine:note')[0].id
    );
    const hook = renderHook(() => useAtomValue(useBlockSuitePagePreview(page)));
    expect(hook.result.current).toBe('Hello, world!');
    page.transact(() => {
      page.getBlockById(id)!.text!.insert('Test', 0);
    });
    await new Promise(resolve => setTimeout(resolve, 100));
    hook.rerender();
    expect(hook.result.current).toBe('TestHello, world!');

    // Insert before
    page.addBlock(
      'affine:paragraph',
      {
        text: new page.Text('First block!'),
      },
      page.getBlockByFlavour('affine:note')[0].id,
      0
    );
    await new Promise(resolve => setTimeout(resolve, 100));
    hook.rerender();
    expect(hook.result.current).toBe('First block! TestHello, world!');
  });
});
