import { test, expect } from '@playwright/test';

import { getDataCenter } from './utils.js';

import 'fake-indexeddb/auto';

test('init data center', async () => {
  const dataCenter = await getDataCenter();
  expect(dataCenter).toBeTruthy();
  await dataCenter.clear();

  const workspace = await dataCenter.load('test1');
  expect(workspace).toBeTruthy();
});

test('init data center singleton', async () => {
  // data center is singleton
  const [dc1, dc2] = await Promise.all([getDataCenter(), getDataCenter()]);
  expect(dc1).toEqual(dc2);

  // load same workspace will get same instance
  const [ws1, ws2] = await Promise.all([dc1.load('test1'), dc2.load('test1')]);
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
