import { test, expect } from '@playwright/test';

import { getDataCenter } from '../utils.js';

import 'fake-indexeddb/auto';

test.describe('Workspace', () => {
  test('create', async () => {});

  test('load', async () => {});

  test('get workspace name', async () => {});
  test('set workspace name', async () => {});

  test('get workspace avatar', async () => {});
  test('set workspace avatar', async () => {});

  test('list', async () => {
    // const dataCenter = await getDataCenter();
    // await dataCenter.clear();
    // await Promise.all([
    //   dataCenter.load('test3'),
    //   dataCenter.load('test4'),
    //   dataCenter.load('test5'),
    //   dataCenter.load('test6'),
    // ]);
    // expect(await dataCenter.list()).toStrictEqual({
    //   test3: { local: true },
    //   test4: { local: true },
    //   test5: { local: true },
    //   test6: { local: true },
    // });
    // await dataCenter.reload('test3', { providerId: 'affine' });
    // expect(await dataCenter.list()).toStrictEqual({
    //   test3: { affine: true },
    //   test4: { local: true },
    //   test5: { local: true },
    //   test6: { local: true },
    // });
  });

  test('destroy', async () => {
    // const dataCenter = await getDataCenter();
    // await dataCenter.clear();
    // // return new workspace if origin workspace is destroyed
    // const ws1 = await dataCenter.load('test7');
    // await dataCenter.destroy('test7');
    // const ws2 = await dataCenter.load('test7');
    // expect(ws1 !== ws2).toBeTruthy();
    // // return new workspace if workspace is reload
    // const ws3 = await dataCenter.load('test8');
    // const ws4 = await dataCenter.reload('test8', { providerId: 'affine' });
    // expect(ws3 !== ws4).toBeTruthy();
  });

  test('remove', async () => {
    // const dataCenter = await getDataCenter();
    // await dataCenter.clear();
    // // remove workspace will remove workspace data
    // await Promise.all([dataCenter.load('test9'), dataCenter.load('test10')]);
    // await dataCenter.delete('test9');
    // expect(await dataCenter.list()).toStrictEqual({ test10: { local: true } });
  });
});
