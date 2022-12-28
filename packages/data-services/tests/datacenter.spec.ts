import { test, expect } from '@playwright/test';
import { getDataCenter } from './utils.js';

test('can init data center', async () => {
  const dataCenter = await getDataCenter();

  expect(dataCenter).toBeTruthy();
});
