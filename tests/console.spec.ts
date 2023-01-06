import { test, expect } from '@playwright/test';
import { loadPage } from './libs/load-page';
import pkg from './../packages/app/package.json';

loadPage();

test.describe('web console', () => {
  test('editor version', async ({ page }) => {
    // https://playwright.dev/docs/evaluating
    // https://github.com/microsoft/playwright/issues/13059
    // Get the handle to a specific function.
    //Later on, call this function with some arguments.
    // const msg = await getEditoVersionHandle.evaluate((post, args) => post);
    // console.log(getEditoVersionHandle);
    const editoVersion = await page.evaluate(() => window.__editoVersion);
    // const documentEditorVersion = await page.inputValue('input#editor-version');
    const pkgEditorVersion = pkg.dependencies['@blocksuite/editor'];

    expect(editoVersion).toBe(pkgEditorVersion);
  });
});
