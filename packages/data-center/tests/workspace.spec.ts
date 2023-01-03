import { test, expect } from '@playwright/test';

import { getDataCenter } from './utils.js';

import 'fake-indexeddb/auto';

test.describe('workspace', () => {
  test('list workspaces', async () => {
    const dataCenter = await getDataCenter();
    await dataCenter.clear();

    await Promise.all([
      dataCenter.load('test3'),
      dataCenter.load('test4'),
      dataCenter.load('test5'),
      dataCenter.load('test6'),
    ]);

    expect(await dataCenter.list()).toStrictEqual([
      'test3',
      'test4',
      'test5',
      'test6',
    ]);
  });
  test('destroy workspaces', async () => {
    const dataCenter = await getDataCenter();
    await dataCenter.clear();

    // return new workspace if origin workspace is destroyed
    const ws1 = await dataCenter.load('test7');
    await dataCenter.destroy('test7');
    const ws2 = await dataCenter.load('test7');
    expect(ws1 !== ws2).toBeTruthy();

    // return new workspace if workspace is reload
    const ws3 = await dataCenter.load('test8');
    const ws4 = await dataCenter.reload('test8', { providerId: 'affine' });
    expect(ws3 !== ws4).toBeTruthy();
  });

  test('remove workspaces', async () => {
    const dataCenter = await getDataCenter();
    await dataCenter.clear();

    // remove workspace will remove workspace data
    await Promise.all([dataCenter.load('test9'), dataCenter.load('test10')]);
    await dataCenter.delete('test9');
    expect(await dataCenter.list()).toStrictEqual(['test10']);
  });
});
