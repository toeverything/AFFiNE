import assert from 'assert';
import { test, expect } from '@playwright/test';

import { getDataCenter, waitOnce } from './utils.js';

import 'fake-indexeddb/auto';

test.describe('search', () => {
  test('search service', async () => {
    const dc = await getDataCenter();
    const workspace = await dc.load('test');

    assert(workspace);
    workspace.createPage('test');
    await waitOnce(workspace.signals.pageAdded);
    const page = workspace.getPage('test');
    assert(page);

    const text = new page.Text(page, 'hello world');
    const blockId = page.addBlock({ flavour: 'affine:paragraph', text });

    expect(workspace.search('hello')).toStrictEqual(
      new Map([[blockId, 'test']])
    );
  });
});
