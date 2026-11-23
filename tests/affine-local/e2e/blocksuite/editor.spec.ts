import { waitNextFrame } from '@affine-test/kit/bs/misc';
import { test } from '@affine-test/kit/playwright';
import { locateEditorContainer } from '@affine-test/kit/utils/editor';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import {
  addDatabase,
  clickNewPageButton,
  getBlockSuiteEditorTitle,
  waitForEditorLoad,
} from '@affine-test/kit/utils/page-logic';
import { expect } from '@playwright/test';

test('database is useable', async ({ page }) => {
  test.slow();
  await openHomePage(page);
  await waitForEditorLoad(page);
  await clickNewPageButton(page);
  const title = getBlockSuiteEditorTitle(page);
  await title.pressSequentially('test title');
  await page.keyboard.press('Enter');
  expect(await title.innerText()).toBe('test title');
  await addDatabase(page);
  const database = page.locator('affine-database');
  await expect(database).toBeVisible();
  await page.reload();
  await waitForEditorLoad(page);
  await clickNewPageButton(page);
  const title2 = getBlockSuiteEditorTitle(page);
  await title2.pressSequentially('test title2');
  await page.waitForTimeout(500);
  expect(await title2.innerText()).toBe('test title2');
  await page.keyboard.press('Enter');
  await addDatabase(page);
  const database2 = page.locator('affine-database');
  await expect(database2).toBeVisible();
});

test('link page is useable', async ({ page }) => {
  await openHomePage(page);
  await waitForEditorLoad(page);
  await clickNewPageButton(page);
  await waitForEditorLoad(page);
  const title = getBlockSuiteEditorTitle(page);
  await title.pressSequentially('page1');
  await page.keyboard.press('Enter');
  expect(await title.innerText()).toBe('page1');
  await clickNewPageButton(page);
  await waitForEditorLoad(page);
  const title2 = getBlockSuiteEditorTitle(page);
  await title2.pressSequentially('page2');
  await page.keyboard.press('Enter');
  expect(await title2.innerText()).toBe('page2');
  await page.keyboard.press('@', { delay: 50 });
  await page.keyboard.press('p');
  await page.keyboard.press('a');
  await page.keyboard.press('g');
  await page.keyboard.press('e');
  await page.keyboard.press('1');
  await waitNextFrame(page);
  await page.locator('icon-button:has-text("page1")').first().click();
  const link = page.locator('.affine-reference');
  await expect(link).toBeVisible();
  await page.click('.affine-reference');
  await page.waitForTimeout(500);

  await expect(
    page.locator('.doc-title-container:has-text("page1")')
  ).toBeVisible();
});

test('append paragraph when click editor gap', async ({ page }) => {
  await openHomePage(page);
  await waitForEditorLoad(page);
  await clickNewPageButton(page);
  await waitForEditorLoad(page);

  const title = getBlockSuiteEditorTitle(page);
  await title.pressSequentially('test title');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.insertText('test content');

  const paragraph = page.locator('affine-paragraph');
  const numParagraphs = await paragraph.count();

  await page.locator('[data-testid=page-editor-blank]').click();
  expect(await paragraph.count()).toBe(numParagraphs + 1);

  await page.locator('[data-testid=page-editor-blank]').click();
  expect(
    await paragraph.count(),
    'click the gap again, should not append another paragraph'
  ).toBe(numParagraphs + 1);

  const editorContainer = locateEditorContainer(page);
  expect(
    await editorContainer.evaluate(el => el.contains(document.activeElement)),
    'editor should should keep being focused'
  ).toBe(true);
});
