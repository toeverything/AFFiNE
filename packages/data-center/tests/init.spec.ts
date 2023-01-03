import { test, expect } from '@playwright/test';

import { getDataCenter } from './utils.js';

import 'fake-indexeddb/auto';

test.describe('Init Data Center', () => {
  test('init', async () => {
    const dataCenter = await getDataCenter();
    expect(dataCenter).toBeTruthy();
    await dataCenter.clear();

    const workspace = await dataCenter.load('test1');
    expect(workspace).toBeTruthy();
  });

  test('init singleton', async () => {
    // data center is singleton
    const [dc1, dc2] = await Promise.all([getDataCenter(), getDataCenter()]);
    expect(dc1).toEqual(dc2);

    // load same workspace will get same instance
    const [ws1, ws2] = await Promise.all([
      dc1.load('test1'),
      dc2.load('test1'),
    ]);
    expect(ws1).toEqual(ws2);
  });

  test('should init error with unknown provider', async () => {
    const dc = await getDataCenter();
    await dc.clear();

    // load workspace with unknown provider will throw error
    test.fail();
    await dc.load('test2', { providerId: 'not exist provider' });
  });

  test.skip('init affine provider', async () => {
    const dataCenter = await getDataCenter();
    await dataCenter.clear();

    // load workspace with affine provider
    // TODO: set constant token for testing
    const workspace = await dataCenter.load('6', {
      providerId: 'affine',
      config: { token: 'YOUR_TOKEN' },
    });
    expect(workspace).toBeTruthy();
  });
});
