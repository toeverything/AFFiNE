import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

import { openHomePage } from '../libs/load-page';
import {
  getBlockSuiteEditorTitle,
  newPage,
  waitEditorLoad,
} from '../libs/page-logic';

async function importImage(page: Page, url: string) {
  await page.evaluate(
    ([url]) => {
      const clipData = {
        'text/html': `<img src=${url} />`,
      };
      const e = new ClipboardEvent('paste', {
        clipboardData: new DataTransfer(),
      });
      Object.defineProperty(e, 'target', {
        writable: false,
        value: document.body,
      });
      Object.entries(clipData).forEach(([key, value]) => {
        e.clipboardData?.setData(key, value);
      });
      document.body.dispatchEvent(e);
    },
    [url]
  );
  await page.waitForTimeout(500);
}

async function closeImagePreviewModal(page: Page) {
  await page
    .getByTestId('image-preview-modal')
    .getByTestId('image-preview-close-button')
    .first()
    .click();
  await page.waitForTimeout(500);
}

test('image preview should be shown', async ({ page }) => {
  await openHomePage(page);
  await waitEditorLoad(page);
  await newPage(page);
  const title = await getBlockSuiteEditorTitle(page);
  await title.click();
  await page.keyboard.press('Enter');
  await importImage(page, 'http://localhost:8081/large-image.png');
  await page.locator('img').first().dblclick();
  const locator = page.getByTestId('image-preview-modal');
  expect(locator.isVisible()).toBeTruthy();
  await closeImagePreviewModal(page);
  expect(await locator.isVisible()).toBeFalsy();
});

test('image go left and right', async ({ page }) => {
  await openHomePage(page);
  await waitEditorLoad(page);
  await newPage(page);
  let blobId: string;
  {
    const title = await getBlockSuiteEditorTitle(page);
    await title.click();
    await page.keyboard.press('Enter');
    await importImage(page, 'http://localhost:8081/large-image.png');
    await page.locator('img').first().dblclick();
    await page.waitForTimeout(500);
    blobId = (await page
      .locator('img')
      .nth(1)
      .getAttribute('data-blob-id')) as string;
    expect(blobId).toBeTruthy();
    await closeImagePreviewModal(page);
  }
  {
    const title = await getBlockSuiteEditorTitle(page);
    await title.click();
    await page.keyboard.press('Enter');
    await importImage(page, 'http://localhost:8081/affine-preview.png');
  }
  const locator = page.getByTestId('image-preview-modal');
  expect(locator.isVisible()).toBeTruthy();
  await page.locator('img').first().dblclick();
  await page.waitForTimeout(1000);
  {
    const newBlobId = (await page
      .locator('img[data-blob-id]')
      .first()
      .getAttribute('data-blob-id')) as string;
    expect(newBlobId).not.toBe(blobId);
  }
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(1000);
  {
    const newBlobId = (await page
      .locator('img[data-blob-id]')
      .first()
      .getAttribute('data-blob-id')) as string;
    expect(newBlobId).toBe(blobId);
  }
});
