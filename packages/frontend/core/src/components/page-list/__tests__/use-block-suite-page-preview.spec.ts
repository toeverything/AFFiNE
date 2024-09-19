/**
 * @vitest-environment happy-dom
 */
import 'fake-indexeddb/auto';

import { AffineSchemas } from '@blocksuite/affine/blocks/schemas';
import { assertExists } from '@blocksuite/affine/global/utils';
import type { Doc } from '@blocksuite/affine/store';
import { DocCollection, Schema } from '@blocksuite/affine/store';
import { renderHook } from '@testing-library/react';
import { useAtomValue } from 'jotai';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { useBlockSuitePagePreview } from '../use-block-suite-page-preview';
let docCollection: DocCollection;

const schema = new Schema();
schema.register(AffineSchemas);

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['requestIdleCallback'] });
  docCollection = new DocCollection({ id: 'test', schema });
  docCollection.meta.initialize();
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
  await initPage(docCollection.createDoc({ id: 'page0' }));
});

describe('useBlockSuitePagePreview', () => {
  test('basic', async () => {
    const page = docCollection.getDoc('page0') as Doc;
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
