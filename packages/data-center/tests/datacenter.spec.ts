import { test, expect } from '@playwright/test';

import { getDataCenter } from './utils.js';

import 'fake-indexeddb/auto';

test('init data center', async () => {
  const dataCenter = await getDataCenter();
  expect(dataCenter).toBeTruthy();
  await dataCenter.clearWorkspaces();

  const workspace = await dataCenter.getWorkspace('test1');
  expect(workspace).toBeTruthy();
});

test('init data center singleton', async () => {
  const [dc1, dc2] = await Promise.all([getDataCenter(), getDataCenter()]);
  expect(dc1).toEqual(dc2);

  const [ws1, ws2] = await Promise.all([
    dc1.getWorkspace('test1'),
    dc2.getWorkspace('test1'),
  ]);
  expect(ws1).toEqual(ws2);
});

test('should init error with unknown provider', async () => {
  const dataCenter = await getDataCenter();
  await dataCenter.clearWorkspaces();

  test.fail();
  await dataCenter.getWorkspace('test2', { providerId: 'not exist provider' });
});

test.skip('init affine provider', async () => {
  const dataCenter = await getDataCenter();
  await dataCenter.clearWorkspaces();

  // TODO: set constant token for testing
  const workspace = await dataCenter.getWorkspace('6', {
    providerId: 'affine',
    config: { token: 'YOUR_TOKEN' },
  });
  expect(workspace).toBeTruthy();
});

test('list workspaces', async () => {
  const dataCenter = await getDataCenter();
  await dataCenter.clearWorkspaces();

  await Promise.all([
    dataCenter.getWorkspace('test3'),
    dataCenter.getWorkspace('test4'),
    dataCenter.getWorkspace('test5'),
    dataCenter.getWorkspace('test6'),
  ]);

  expect(await dataCenter.listWorkspace()).toStrictEqual([
    'test3',
    'test4',
    'test5',
    'test6',
  ]);
});

test('destroy workspaces', async () => {
  const dataCenter = await getDataCenter();
  await dataCenter.clearWorkspaces();

  const dc1 = await dataCenter.getWorkspace('test7');
  await dataCenter.destroyWorkspace('test7');
  const dc2 = await dataCenter.getWorkspace('test7');

  expect(dc1 !== dc2).toBeTruthy();
});

test('remove workspaces', async () => {
  const dataCenter = await getDataCenter();
  await dataCenter.clearWorkspaces();

  await Promise.all([
    dataCenter.getWorkspace('test8'),
    dataCenter.getWorkspace('test9'),
  ]);

  await dataCenter.removeWorkspace('test8');

  expect(await dataCenter.listWorkspace()).toStrictEqual(['test9']);
});
