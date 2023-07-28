import { test } from '@affine-test/kit/playwright';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import {
  clickPageMoreActions,
  waitEditorLoad,
} from '@affine-test/kit/utils/page-logic';
import { expect } from '@playwright/test';

test('Switch to edgeless by switch edgeless item', async ({ page }) => {
  async function getCount(): Promise<number> {
    return page.evaluate(() => {
      // @ts-expect-error
      return globalThis.__toastCount;
    });
  }
  await openHomePage(page);
  await waitEditorLoad(page);
  const btn = await page.getByTestId('switch-edgeless-mode-button');
  await page.evaluate(() => {
    // @ts-expect-error
    globalThis.__toastCount = 0;
    window.addEventListener('affine-toast:emit', () => {
      // @ts-expect-error
      globalThis.__toastCount++;
    });
  });
  await btn.click();
  await page.waitForTimeout(100);
  {
    const count = await getCount();
    expect(count).toBe(1);
  }
  const edgeless = page.locator('affine-edgeless-page');
  expect(await edgeless.isVisible()).toBe(true);

  const editorWrapperPadding = await page
    .locator('.editor-wrapper.edgeless-mode')
    .evaluate(element => {
      return window.getComputedStyle(element).getPropertyValue('padding');
    });
  expect(editorWrapperPadding).toBe('0px');
  {
    const count = await getCount();
    expect(count).toBe(1);
  }
  await btn.click();
  await btn.click();
  await btn.click();
  await page.waitForTimeout(100);
  {
    const count = await getCount();
    expect(count).toBe(1);
  }
});

test('Convert to edgeless by editor header items', async ({ page }) => {
  await openHomePage(page);
  await waitEditorLoad(page);
  await clickPageMoreActions(page);
  const menusEdgelessItem = page.getByTestId('editor-option-menu-edgeless');
  await menusEdgelessItem.click({ delay: 100 });
  const edgeless = page.locator('affine-edgeless-page');
  expect(await edgeless.isVisible()).toBe(true);
});

test('Able to insert the title of an untitled page', async ({ page }) => {
  await openHomePage(page);
  await waitEditorLoad(page);
  const titleBarTextContent = await page.getByTestId('title-edit-button');
  await titleBarTextContent.click({ delay: 100 });
  const titleContent = await page.getByTestId('title-content');
  await titleContent.fill('test');
  await page.getByTestId('save-edit-button').click({ delay: 100 });
  expect(await titleBarTextContent.textContent()).toBe('test');
});

test('Able to edit the title of an existing page', async ({ page }) => {
  await openHomePage(page);
  await waitEditorLoad(page);
  const titleBarTextContent = await page.getByTestId('title-edit-button');
  await titleBarTextContent.click({ delay: 100 });
  const titleContent = await page.getByTestId('title-content');
  await titleContent.fill('test');
  await page.getByTestId('save-edit-button').click({ delay: 100 });
  expect(await titleBarTextContent.textContent()).toBe('test');
  await titleBarTextContent.click({ delay: 100 });
  await titleContent.fill('Sample text 2');
  await page.getByTestId('save-edit-button').click({ delay: 100 });
  expect(await titleBarTextContent.textContent()).toBe('Sample text 2');
});

test('Clearing out the title bar will remove the page title', async ({
  page,
}) => {
  await openHomePage(page);
  await waitEditorLoad(page);
  const titleBarTextContent = await page.getByTestId('title-edit-button');
  await titleBarTextContent.click({ delay: 100 });
  const titleContent = await page.getByTestId('title-content');
  await titleContent.fill('test');
  await page.getByTestId('save-edit-button').click({ delay: 100 });
  expect(await titleBarTextContent.textContent()).toBe('test');
  await titleBarTextContent.click({ delay: 100 });
  await titleContent.fill('');
  await page.getByTestId('save-edit-button').click({ delay: 100 });
  expect(await titleBarTextContent.textContent()).toBe('Untitled');
});
