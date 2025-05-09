import { expect } from '@playwright/test';

import {
  enterPlaygroundRoom,
  initEmptyParagraphState,
} from './utils/actions/index.js';
import { test } from './utils/playwright.js';

declare global {
  interface Window {
    testWorker: Worker;
  }
}

test.skip('should the worker in the playground work fine.', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);

  const ok = await page.evaluate(async () => {
    return new Promise(resolve => {
      window.testWorker.postMessage('ping');
      window.testWorker.addEventListener('message', event => {
        if (event.data === 'pong') {
          resolve(true);
        }
      });
    });
  });

  expect(ok).toBeTruthy();
});
