import { test, expect } from '@playwright/test';
import { loadPage } from './libs/load-page';
import pkg from './../packages/app/package.json';

loadPage();

test.describe('web console', () => {
  test('editor version', async ({ page }) => {
    // https://playwright.dev/docs/evaluating
    // https://github.com/microsoft/playwright/issues/13059
    // Get the handle to a specific function.
    // const getEditoVersionHandle = await page.evaluate(
    //   'window.__getEditoVersion'
    // );
    //Later on, call this function with some arguments.
    // const msg = await getEditoVersionHandle.evaluate((post, args) => post);
    // console.log(getEditoVersionHandle);
    const documentEditorVersion = await page.inputValue('input#editor-version');
    const pkgEditorVersion = pkg.dependencies['@blocksuite/editor'];

    expect(documentEditorVersion).toBe(pkgEditorVersion);
    console.log('pkgEditorVersion', pkgEditorVersion);
  });
});
